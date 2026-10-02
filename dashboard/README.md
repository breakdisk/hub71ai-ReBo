# Onboard Engine dashboard

Enterprise mission control for UAE relocation journeys. The interface is exception-based: an empty exception inbox reads **Silence is green**, and failed workflow steps are surfaced for human review.

## Run locally

```powershell
cd dashboard
pnpm install
$env:VITE_API_URL = "http://localhost:8080" # optional; this is the default
pnpm run dev
```

Open the loopback Vite URL shown in the terminal. `pnpm run build` creates the static production bundle in `dashboard/dist`; `pnpm run preview` serves that bundle. The frontend expects the API routes in the root project contract and listens to `/api/events` (SSE), with API polling every 15 seconds as a refresh/reconnect fallback.

Set `VITE_API_URL` at build or dev-server start to point at another API origin. A host page may also set `window.__ONBOARD_ENGINE_CONFIG__ = { apiUrl: "..." }` before the app module loads. If the API is unavailable, the dashboard shows the connection state and retries without discarding the form.

## API used

- `GET /health`, `GET /api/status`
- `GET /api/pipelines`, `GET /api/exceptions`, `GET /api/escalations`
- `GET /api/events` (SSE: `pipeline.updated`, `exception.created`, `escalation.created`)
- `POST /api/onboarding` with `{ firstName, lastName, email, identityToken }`

The Rust API allows browser access only from the local Vite development and preview origins. For a dashboard browser smoke check without Rust, run `node scripts/dev-mock-api.mjs` from the repository root; the fixture binds to loopback and keeps all data in memory.

## Safety/readiness prototype

The page includes UI-only previews for candidate-opt-in community resources, legal ruleset readiness, specialist assignments, lease-proof and human-approval gates, and multi-region disaster recovery. These surfaces use explicit unconfigured/unknown states and do not contact external providers or initiate actions. The community control only reveals synthetic sample resources in the current page. No tax or gratuity amount is calculated or displayed. The read-only escalation feed uses the local backend API; assignment and acknowledgement controls remain disabled.

Run `pnpm run check:readiness` to check the safeguards and required unknown states in these prototype surfaces.
