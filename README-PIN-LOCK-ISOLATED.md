# Vendalume PIN lock — isolated branch

Branch: `feature/pin-lock-isolated` (starting commit `7f16ac2075d4549977362f5b195383a76ea4a09a`).

This branch stages local-lock UX for Gestão and Vendedor, app lifecycle callbacks in isolated Android wrappers, immutable outbox identity guards, and a **draft-only** Supabase migration. The migration has not been executed. The APK workflow is restricted to this branch and uploads temporary artifacts only; it cannot publish a release or update Pages.

## Important before testing

- The test project's Supabase URL/anon key were not independently verified. The production endpoint/key were removed, and a placeholder is present. Securely inject the correct test project's publishable key before connecting; do not commit it.
- Seller PIN management and server verifier fetch require the draft migration to be reviewed and deliberately applied in the isolated test project. Manager-side one-time generated PIN works only after those RPCs are installed. No production DB has been changed.
- Local PIN gating is a privacy deterrent only. Local storage can be removed or altered and short PIN offline verifiers can be guessed; do not treat it as authentication.
- Pending queue entries without a matching saved business/seller/device identity remain preserved but are intentionally not uploaded. No auto-binding of legacy outbox entries.
- Lifecycle wrappers load bundled `index.html`, not the public Pages URL. The Android project's `index.html` asset is filled by the isolated workflow, not modified or published on Pages.
