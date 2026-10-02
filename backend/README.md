# Relocation Engine API (local demo)

This crate is a runnable Rust API and in-memory saga simulator. Every external integration is a mock provider; it makes no government, banking, travel, or mover network calls.

## Run

From the repository root, run:

```powershell
cargo run --manifest-path backend/Cargo.toml
```

This is an unauthenticated, local-only demo. It refuses to start if `ONBOARD_ENGINE_BIND` resolves to a non-loopback address. The API defaults to `127.0.0.1:8080`; set `ONBOARD_ENGINE_BIND` to another loopback address and `APP_ENV` to change the environment label. The deterministic mock failure tokens below are enabled only when `APP_ENV=local-demo` (the default). All records, idempotency keys, exceptions, escalations, and audit events are held in memory and reset on restart. No real government, PRO, bank, travel, or logistics channel is enabled.

Browser CORS is limited to the local dashboard origins on ports `5173` (Vite development) and `4173` (Vite preview), using either `localhost` or `127.0.0.1`.

## API contract

- `GET /health` returns `{"status":"ok"}`.
- `GET /api/status` returns `status`, `environment`, `pipelineCount`, `exceptionCount`, and `providers` (`"mock"`).
- `GET /api/pipelines` returns `{ "items": [pipelineSummary] }`. A summary contains `pipelineId`, `candidate` (`firstName`, `lastName`, `email`), `stage`, `state`, `createdAt`, and `updatedAt`.
- `GET /api/exceptions` returns `{ "items": [exception] }`. An exception contains `id`, `pipelineId`, `stage`, `code`, `message`, and `occurredAt`.
- `GET /api/escalations` returns `{ "items": [escalation] }`. A mock provider hard failure creates a case-manager record containing `id`, `pipelineId`, `stage`, `severity`, `owningTeam`, `status` (`pending_human`), `requiredNextAction`, and `createdAt`.
- `GET /api/audit` returns the append-only stage-transition audit items (`id`, `pipelineId`, `actor`, `action`, `stage`, `state`, `timestamp`), with typed escalation routing details on `human_escalation.created`. Audit records exclude identity token values.
- `GET /api/events` streams `pipeline.updated` (pipeline summary data), `exception.created` (exception data), and `escalation.created` (case-manager escalation data) events.
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

The route-level HTTP tests cover success through all saga steps, retry idempotency, duplicate-email conflicts, deterministic failure, escalation storage/routing and audit, safe validation/conflict responses, environment gating, and the health/status response shapes. Unit tests check routing configuration and the loopback-only bind policy.
