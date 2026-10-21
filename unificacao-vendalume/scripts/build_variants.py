#!/usr/bin/env python3
"""Generate local Vendalume web and test outputs from one HTML source.

This draft writes only under dist/; it does not publish or contact GitHub.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'index.html'
TEMPLATE_ZIP = ROOT.parent / 'android-project-test.zip'
DIST = ROOT / 'dist'
PLACEHOLDER = '__VENDALUME_BUILD_CONFIG__'

OPTIONAL_BLOCKS = {
    'LICENSE_STYLE': 'licenseRequired',
    'LICENSE_FAST_RESTORE': 'licenseRequired',
    'ACTIVATION_SCREEN': 'licenseRequired',
    'LICENSE_GATE_SCRIPT': 'licenseRequired',
    'HISTORICAL_DATE_PICKER': 'historicalCashClosing',
    'SELECTED_DATE_PDF_BUTTON': 'historicalCashClosing',
}


def read_config(name: str) -> dict:
    return json.loads((ROOT / 'config' / name).read_text(encoding='utf-8'))


def render_html(config: dict) -> str:
    html = SOURCE.read_text(encoding='utf-8')
    for block_name, config_key in OPTIONAL_BLOCKS.items():
        pattern = re.compile(
            rf'<!-- VARIANT:{block_name}:START -->\s*(.*?)\s*<!-- VARIANT:{block_name}:END -->',
            re.DOTALL,
        )
        matches = list(pattern.finditer(html))
        if len(matches) != 1:
            raise ValueError(f'Expected one marked block for {block_name}, found {len(matches)}.')
        content = matches[0].group(1)
        replacement = content if bool(config.get(config_key)) else ''
        html = pattern.sub(lambda _match: replacement, html, count=1)
    if 'VARIANT:' in html:
        raise ValueError('Unprocessed variant marker remains in generated HTML.')
    if html.count(PLACEHOLDER) != 1:
        raise ValueError('Build configuration placeholder is missing or repeated.')
    html = html.replace(PLACEHOLDER, json.dumps(config, ensure_ascii=False, separators=(',', ':')), 1)
    return html


def update_test_gradle(base: str, config: dict) -> str:
    updated, code_count = re.subn(r'versionCode\s+\d+', f"versionCode {config['versionCode']}", base, count=1)
    updated, name_count = re.subn(r"versionName\s+'[^']+'", f"versionName '{config['versionName']}'", updated, count=1)
    if code_count != 1 or name_count != 1:
        raise ValueError('Could not safely set the test Android version in app/build.gradle.')
    if "applicationId 'com.clauber.vendasfacil'" not in updated or "applicationIdSuffix '.teste'" not in updated:
        raise ValueError('The test package ID/suffix is not the expected one; refusing to generate the test project.')
    if not str(config['applicationId']).endswith(str(config['applicationIdSuffix'])):
        raise ValueError('Test applicationId and applicationIdSuffix do not agree.')
    return updated


def write_test_zip(test_html: str, config: dict) -> Path:
    output_zip = DIST / 'test' / 'android-project-test.zip'
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    replaced: set[str] = set()
    with ZipFile(TEMPLATE_ZIP, 'r') as source_zip, ZipFile(output_zip, 'w', ZIP_DEFLATED) as out_zip:
        for item in source_zip.infolist():
            if item.filename == 'app/src/main/assets/index.html':
                out_zip.writestr(item, test_html.encode('utf-8'))
                replaced.add(item.filename)
            elif item.filename == 'app/build.gradle':
                original = source_zip.read(item.filename).decode('utf-8')
                updated = update_test_gradle(original, config)
                out_zip.writestr(item, updated.encode('utf-8'))
                replaced.add(item.filename)
            else:
                out_zip.writestr(item, source_zip.read(item.filename))
    expected = {'app/src/main/assets/index.html', 'app/build.gradle'}
    if replaced != expected:
        raise ValueError(f'Test Android template is missing required files: {sorted(expected - replaced)}')
    return output_zip


def main() -> None:
    production = read_config('producao.json')
    test_config = read_config('teste.json')
    if not production['historicalCashClosing']:
        raise ValueError('The principal web build must include historical cash closing.')
    if not test_config['licenseRequired'] or not test_config['historicalCashClosing']:
        raise ValueError('Test configuration must keep test activation and historical closing enabled.')

    production_html = render_html(production)
    test_html = render_html(test_config)
    shared_markers = ['completedOrderCustomerCode', 'Código do cliente:', 'function cashClosingPdfBlob', 'pageContents.push(page1[0])', 'id="cashCloseDateSelect"', 'id="exportCashClosingPdf"', 'function addPixReceipt()']
    for marker in shared_markers:
        if marker not in production_html or marker not in test_html:
            raise ValueError(f'Missing shared behavior in a generated variant: {marker}')
    if test_config['licenseRequired'] and 'id="activationForm"' not in test_html:
        raise ValueError('The test build must keep its license activation screen.')
    if production['licenseRequired'] != ('id="activationForm"' in production_html):
        raise ValueError('The principal activation screen does not match its configuration.')
    shared_cash_markers = ['id="cashCloseDateSelect"', 'id="exportCashClosingPdf"']
    for marker in shared_cash_markers:
        if marker not in production_html or marker not in test_html:
            raise ValueError(f'Historical cash-closing UI must be included in both builds: {marker}')
    if 'window.VENDALUME_BUILD_CONFIG={"displayName":"Vendalume principal"' not in production_html:
        raise ValueError('The production build config was not inserted correctly.')

    web_dir = DIST / 'web'
    test_assets = DIST / 'test' / 'app' / 'src' / 'main' / 'assets'
    web_dir.mkdir(parents=True, exist_ok=True)
    test_assets.mkdir(parents=True, exist_ok=True)
    (web_dir / 'index.html').write_text(production_html, encoding='utf-8')
    (test_assets / 'index.html').write_text(test_html, encoding='utf-8')
    output_zip = write_test_zip(test_html, test_config)

    with ZipFile(output_zip, 'r') as built:
        zipped_html = built.read('app/src/main/assets/index.html').decode('utf-8')
        zipped_gradle = built.read('app/build.gradle').decode('utf-8')
    if zipped_html != test_html:
        raise ValueError('The generated test ZIP does not match the generated test HTML.')
    if f"versionCode {test_config['versionCode']}" not in zipped_gradle:
        raise ValueError('The generated test ZIP has an unexpected versionCode.')

    print('OK — both local builds generated from one source; nothing was published.')
    print(f'Production web: {web_dir / "index.html"}')
    print(f'Test HTML: {test_assets / "index.html"}')
    print(f'Test Android project: {output_zip}')
    print(f'Production license required: {production["licenseRequired"]}; historical closing: {production["historicalCashClosing"]}')
    print(f'Test license required: {test_config["licenseRequired"]}; historical closing: {test_config["historicalCashClosing"]}')


if __name__ == '__main__':
    main()
