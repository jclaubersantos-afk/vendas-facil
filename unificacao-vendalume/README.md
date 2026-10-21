# Vendalume — fonte compartilhada (rascunho)

Esta pasta contém a fonte comum e o gerador de variantes. A integração é somente na branch `vendalume-licenca-teste`; não publica o site nem uma versão de produção.

- `src/index.html`: fonte única da interface e da lógica comum.
- `config/producao.json`: versão web futura, com ativação por licença e com fechamento histórico.
- `config/teste.json`: build Android de teste, com ativação por licença e seletor de data passada.
- `scripts/build_variants.py`: cria `dist/web/index.html` e um ZIP Android de teste a partir da fonte comum.
- O `android-project-test.zip` na raiz do repositório é o molde Android. O gerador substitui o HTML embutido e atualiza a versão, preservando o identificador/sufixo de teste.

Para gerar localmente, a partir da raiz do repositório:

```text
python3 unificacao-vendalume/scripts/build_variants.py
```

As regras comerciais pagas (prazo, aparelhos e revalidação offline) continuam pendentes. O workflow desta branch deve compilar e disponibilizar apenas um APK de teste; não deve publicar Pages, criar release de produção ou substituir instalações.