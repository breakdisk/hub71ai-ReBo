# Relocation Engine API (local demo)

This crate is a runnable Rust API and in-memory saga simulator. Every external integration is a mock provider; it makes no government, banking, travel, or mover network calls.

## Run

From the repository root, run:

```powershell
cargo run --manifest-path backend/Cargo.toml
```

This is an unauthenticated, local-only demo. It refuses to start if `ONBOARD_ENGINE_BIND` resolves to a non-loopback address; there is no non-loopback override. The API defaults to `127.0.0.1:8080`; set `ONBOARD_ENGINE_BIND` to another loopback address and `APP_ENV` to change the environment label. Synthetic writes for mobility, escalation, home-readiness, and resilience workflows are accepted only when `APP_ENV=local-demo` (the default). All records, idempotency keys, exceptions, escalations, mobility evidence, home-readiness gates, resilience reviews, and audit events are held in memory and reset on restart. Use synthetic data only. No real government, PRO, bank, travel, utility, or logistics channel is enabled.

Browser CORS is limited to the local dashboard origins on ports `5173` (Vite development) and `4173` (Vite preview), using either `localhost` or `127.0.0.1`.

## API contract

- `GET /health` returns `{"status":"ok"}`.
- `GET /api/status` returns `status`, `environment`, `pipelineCount`, `exceptionCount`, and `providers` (`"mock"`).
- `GET /api/pipelines` returns `{ "items": [pipelineSummary] }`. A summary contains `pipelineId`, `candidate` (`firstName`, `lastName`, `email`), `stage`, `state`, `createdAt`, and `updatedAt`.
- `GET /api/exceptions` returns `{ "items": [exception] }`. An exception contains `id`, `pipelineId`, `stage`, `code`, `message`, and `occurredAt`.
- `GET /api/escalations` returns `{ "items": [escalation] }`. A mock provider hard failure creates a case-manager record containing `id`, `pipelineId`, `stage`, `severity`, `owningTeam`, `status` (`pending_human`), `requiredNextAction`, and `createdAt`.
- `PATCH /api/escalations/{id}` accepts `{"humanConfirmed":true,"action":"acknowledge"}` or `{"humanConfirmed":true,"action":"resolve","resolutionCode":"evidence_corrected"}`. Cases move from `pending_human` to `acknowledged` to `resolved`. Resolution requires prior acknowledgement and one of `evidence_corrected`, `provider_recovered`, `approved_manual_resolution`, or `false_positive`. Repeating the same transition is idempotent. Each state transition creates an audit record and `escalation.updated` event; no person or government channel is contacted.
- `GET /api/mobility` returns `{ "ruleset": {"configured":false,"approved":false,"version":null}, "travelDays": [...], "salaryChanges": [...] }`. Travel-day entries are ordered by date ascending and salary changes by effective date ascending. This state deliberately means no legal ruleset is available; the API makes no tax-residency conclusion and calculates no gratuity or tax-equalization amount.
- `POST /api/mobility/travel-days` accepts `{"date":"2025-01-02","country":"AE","kind":"arrival","humanConfirmed":true,"consentAccepted":true}`. Only employee-confirmed, consented, past-or-current dates for AE are accepted. Exact duplicate date/country/kind entries return the existing record with `200`; new entries return `201`. These records are evidence supplied by a person, not proof from a carrier, government, or employer, and are not a tax-residency decision.
- `POST /api/mobility/salary-changes` accepts `{"effectiveDate":"2025-01-01","basicSalary":17500,"currency":"AED","humanConfirmed":true}`. The input is stored as synthetic evidence only. It is not used to calculate or display any gratuity amount. An exact repeat for an effective date returns the existing row; a different value for that date returns `409`.
- `GET /api/home-readiness` returns one gate, initially `{"leaseReference":null,"leaseProofReviewed":false,"humanApproved":false,"utilities":{"status":"blocked","providerStatus":"unconfigured","reason":"..."}}`. `POST /api/home-readiness` accepts `{"leaseReference":"synthetic:lease-01","leaseProofReviewed":true,"humanApproved":true}`. Only opaque references beginning with `synthetic:` are accepted. The response records the two approvals while utilities remain blocked and unconfigured. No DEWA, Empower, telecom, mover, or smart-home request is submitted, booked, charged, or activated.
- `GET /api/resilience` returns an `unknown` posture with `rpoMinutes:null`, `rtoMinutes:null`, `failoverConfigured:false`, and stored `reviews` ordered by record time ascending (latest last). `POST /api/resilience/reviews` accepts `{"humanConfirmed":true,"reviewedAt":"2025-01-01","outcome":"gaps_identified"}` where outcome is `gaps_identified` or `no_known_gaps`. A record is labeled `evidenceType:"tabletop_only"` and `failoverExecuted:false`; it is not a drill, restore, or failover result. No live multi-region capability is claimed.
- `GET /api/audit` returns the append-only stage-transition audit items (`id`, `pipelineId`, `actor`, `action`, `stage`, `state`, `timestamp`), with typed escalation routing details on `human_escalation.created`. Audit records exclude identity token values.
- `GET /api/events` streams `pipeline.updated` (pipeline summary data), `exception.created` (exception data), and `escalation.created` / `escalation.updated` (case-manager escalation data) events. It also streams `mobility.travel_day.recorded`, `mobility.salary_change.recorded`, `home_readiness.gate.recorded`, and `resilience.tabletop_review.recorded`. The new mobility events contain only a record ID; home-readiness events contain only `gateRecorded:true`; resilience events contain only a record ID. No travel date, salary value, lease reference, or freeform text is broadcast.
- `POST /api/onboarding` accepts:

  ```json
  {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.test",
    "identityToken": "synthetic:opaque-ref"
  }
  ```

  Submissions return `201` and an `OnboardingResponse` with a pipeline ID, final state and stage, candidate summary, and stage events. Mock hard failures also attach an `escalation` record to the response, store it for `/api/escalations`, and audit the owning team, severity, status, and next action. A retry with the same `Idempotency-Key` returns `200` and the original response. Without a header, the normalized email is the idempotency scope. Reusing a key for a different candidate returns `409`; trying to create another pipeline for an email that already has one returns `409` with code `EMAIL_ALREADY_ONBOARDED`.

All validation errors use `{ "error": { "code": "...", "message": "..." } }`. Requests are limited to 16 KiB.

## Demo exceptions

Submit `identityToken: "demo:fail-icp"` to make the ICP mock fail deterministically. The API still returns `201` because the onboarding pipeline was created; its response has `state: "failed"`, `stage: "icp"`, and an exception with code `ICP_DEMO_REJECTION`. The exception also appears in `/api/exceptions`, and both pipeline and exception SSE events are emitted. Other supported tokens are `demo:fail-banking`, `demo:fail-travel`, and `demo:fail-logistics`.

Each hard failure is routed to a human owner using the configured stage policy. The default route sends ICP failures to `icp_case_management` with high severity; banking failures to `banking_operations` with high severity; travel failures to `travel_desk` with medium severity; and logistics failures to `logistics_coordination` with medium severity. Each route includes a required next action, and cases remain `pending_human`. This slice records the handoff only; it does not contact a person, government office, PRO, or external service.

To override routing, set `ESCALATION_ROUTING_JSON` to a complete JSON object with `icp`, `banking`, `travel`, and `logistics` entries. Each entry requires `severity` (`low`, `medium`, `high`, or `critical`), `owningTeam` (`icp_case_management`, `banking_operations`, `travel_desk`, `logistics_coordination`, or `relocation_operations`), and `requiredNextAction` (1-240 printable bytes). Invalid routing prevents startup. For example, customize the ICP owner and action while retaining a complete explicit table:

```powershell
$env:ESCALATION_ROUTING_JSON = '{"icp":{"severity":"critical","owningTeam":"relocation_operations","requiredNextAction":"Assign a senior case manager to review the ICP exception."},"banking":{"severity":"high","owningTeam":"banking_operations","requiredNextAction":"Review the eKYC exception."},"travel":{"severity":"medium","owningTeam":"travel_desk","requiredNextAction":"Review the travel exception."},"logistics":{"severity":"medium","owningTeam":"logistics_coordination","requiredNextAction":"Review the logistics exception."}}'
```

## Identity and audit handling

`identityToken` is an opaque transient provider input. The API does not include it in a pipeline, response, exception, audit record, or event, and does not log request bodies. Raw passport numbers and identity documents are not part of this API. The in-memory append-only audit records describe stage transitions only. Use synthetic data for local development.

## Tests

```powershell
cargo test --manifest-path backend/Cargo.toml
```

The route-level HTTP tests cover success through all saga steps, retry idempotency, duplicate-email conflicts, deterministic failure, escalation lifecycle transitions and audit, consented travel evidence, ruleset-unavailable behavior, salary-record idempotency without calculations, home approval gates, tabletop-only resilience evidence, safe validation/conflict responses, environment gating, and the health/status response shapes. Unit tests check routing configuration and the strict loopback-only bind policy.
