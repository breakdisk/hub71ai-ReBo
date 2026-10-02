# Onboard Engine mobile client

Expo / React Native local-first onboarding client. Name and email edits are autosaved as an encrypted local draft; submission moves them into the SQLite outbox. The opaque identity token reference is kept separately in iOS Keychain / Android SecureStore. A single outbox row is sent to `POST /api/onboarding` with a stable `Idempotency-Key`; transient failures stay queued with bounded exponential retry. The worker runs on app launch/resume, when connectivity returns, after submit, and on a scheduled retry.

The wire body matches the backend contract:

```json
{
  "firstName": "Amira",
  "lastName": "Example",
  "email": "amira@example.test",
  "identityToken": "tok_demo_ref_1234ABCD"
}
```

Only synthetic references matching `tok_...` are accepted by the client. No camera capture, OCR, raw identity number, image, or document persistence is implemented in this prototype. Replace the synthetic token entry field with an approved token issuer / device credential flow before handling real identity documents.

The soft-landing section contains static arrival guidance and short workplace-etiquette prompts marked for local review. Opening the guide and the family/community referral placeholder is optional. The family/community disclosure is view-only: it collects and sends no family or interest data and performs no matching. This client requests no location permission and shows no external contact links.

## Run

Install dependencies from this directory with `pnpm install`, set `EXPO_PUBLIC_API_URL` when the app needs a different base URL, then run `pnpm start` and `pnpm run prebuild` before `pnpm android` or `pnpm ios`. The development default is `http://localhost:8080`. The backend in this prototype binds only to loopback, so a physical device cannot reach it over the LAN; device testing requires a separately secured, reachable backend setup.

The SQLCipher config plugin is enabled in `app.json`. Expo’s SQLite documentation notes SQLCipher requires a native prebuild and is not available in Expo Go, so use a development build / native build. The app refuses to initialize its outbox if the SQLite native module does not expose SQLCipher. A random 256-bit key is generated with Expo Crypto and saved to SecureStore; the key and token reference are never logged.

## Checks

Run `pnpm test` for validation, API contract, and sync worker tests. Run `pnpm typecheck` to typecheck the Expo project. The sync tests use in-memory outbox/vault fakes and a stubbed Fetch implementation; platform SQLite encryption, Keychain/Keystore behavior, and background lifecycle need Android/iOS device or simulator validation.
