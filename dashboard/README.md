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
- `GET /api/events` (SSE: `pipeline.updated`, `exception.created`, `escalation.created`, `escalation.updated`, mobility/home-readiness/resilience record events)
- `POST /api/onboarding` with `{ firstName, lastName, email, identityToken }`
- `PATCH /api/escalations/:id` with an explicit human confirmation. Resolution requires acknowledgement first and one of the fixed local outcome codes: `evidence_corrected`, `provider_recovered`, `approved_manual_resolution`, or `false_positive`.
- `GET /api/mobility`; `POST /api/mobility/travel-days`; `POST /api/mobility/salary-changes` for synthetic, human-confirmed movement and compensation records.
- `GET` and `POST /api/home-readiness` to record lease proof review and human approval. The API keeps utility and smart-home services blocked and unconfigured.
- `GET /api/resilience`; `POST /api/resilience/reviews` to log a human-confirmed tabletop review only.

The Rust API allows browser access only from the local Vite development and preview origins. For a dashboard browser smoke check without Rust, run `node scripts/dev-mock-api.mjs` from the repository root; the fixture binds to loopback and keeps all data in memory.

## Safety/readiness prototype

The readiness cards now provide local prototype workflows for all five gaps. A local-browser opt-in toggle simulates the candidate choice for synthetic soft-landing examples; it is explicitly not consent from a real candidate, and it can be cleared from browser storage. The mobility ledger accepts human-confirmed synthetic travel and salary-change records through the local API; it shows record counts and dates only. It does not determine tax residence, calculate gratuity, or display submitted salary values. Its ruleset status is informational and no legal output is produced.

Human escalation cases can be acknowledged and then resolved using a fixed outcome code. An acknowledgement remains open until a human records an outcome. Case actions only update the local demo API; there is no specialist assignment, government liaison message, or provider communication. Home-readiness records require a lease reference plus separate lease-review and approval checkboxes. Recording both gates does not create a utility, telecom, or IoT request. Resilience reviews are tabletop notes only: the card remains **READINESS UNKNOWN**, and no infrastructure health check, traffic change, or failover runs.

All readiness inputs are for synthetic demo data. Routes that are missing or unavailable remain visibly unconfigured and cannot be used to claim production readiness. Run `pnpm run check:readiness` to check that these safeguards and confirmation gates stay in place.
