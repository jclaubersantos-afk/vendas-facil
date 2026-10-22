# Vendalume Gestão — validation gates

A successful syntax check or APK build is not evidence that sales sync works. Do not ask for a sale test until every gate below has a recorded pass.

## Build and origin checks

- Build only from `feature/vendalume-gestao` using `.github/workflows/build-sync-validation.yml`.
- Confirm the Android app ID is `com.clauber.vendasfacil.syncvalidation`, and it loads the feature-branch seller HTML from packaged assets.
- Confirm Supabase Auth, REST/RPC, and Realtime network requests work from the app's actual WebView origin. Do not enable broad file-origin access as a shortcut; use an HTTPS validation page or a controlled app-assets HTTPS origin.
- Confirm Principal Pages, `main`, the production `android-project.zip`, and `.github/workflows/build-apk.yml` have no changes.

## Auth, tenant and pairing checks

- Manager login and business creation work; anonymous seller sessions cannot create businesses or read manager/sales data.
- Manager creates a disposable seller and a random high-entropy pairing code; raw code is never returned from DB, code hash only, expiry is 15 minutes, and redemption succeeds once.
- A linked seller device cannot silently change seller or business. Existing active device/link must be explicitly unlinked before new pairing.
- Two businesses are created for the test: prove manager A cannot read or update B, and seller A cannot read peer/manager data.
- Verify the deployed SQL function bodies, grants, and RLS policies, not just local migration drafts.

## Sale flow checks

- Online sale: dashboard gets correct seller, sale date, products, quantities, total, payment and commission. Network payload and DB rows contain no customer name, phone, address, or note.
- Offline sale: airplane mode, create sale, restart app while pending, reconnect, and confirm it appears exactly once. Queue and local sale must be persisted together.
- Replay the same sync request; total and lines remain unchanged (idempotency).
- Edit a synced sale, then edit it again while a prior request is in flight; latest state must win and a stale error/ack must not replace newer outbox state.
- Cancel a synced sale; manager must see a cancellation tombstone, not a missing or completed sale.
- Confirm pending/error/synced status is only reported after durable local state and server acknowledgement.
- Pair recovery: simulate termination after server claims code but before local profile save; relaunch and recover same device/seller. No second device or cross-seller binding may result.
- Validate backup/import/clear behavior, low storage, network loss, app restart, and rapid repeated edits.

## Physical-device test

Install only after exporting a Vendalume backup. Use the isolated validation app ID, a disposable manager/business/seller and synthetic records. Verify Samsung WebView loading, pairing, actual HTTP requests, offline retry, dashboard refresh, commission, cancellation and restart. Then confirm all test records are identifiable for cleanup.

Do not move seller-sync code into the Principal app or publish it until these gates pass and Lima approves the reviewed changes.
