# Local API contract

Base URL: `http://localhost:8080`

This contract is for the local demo only. `identityToken` must be a synthetic tokenized reference. Do not send raw passport numbers, document images, or production credentials.

## Read operations

- `GET /health` returns `{ "status": "ok" }`.
- `GET /api/status` returns `{ "status": "healthy", "environment": "local-demo", "pipelineCount": 0, "exceptionCount": 0, "providers": "mock" }` with live counts.
- `GET /api/pipelines` returns `{ "items": [...] }`. Pipeline stages are `identity`, `icp`, `banking`, `travel`, `logistics`, and `complete`; states are `in_progress`, `completed`, and `failed`.
- `GET /api/exceptions` returns `{ "items": [...] }`.
- `GET /api/escalations` returns `{ "items": [...] }` containing typed human cases for mock hard failures. Each case includes its `pipelineId`, `stage`, `severity`, `owningTeam`, `status` (`pending_human`), required next action, and creation time.
- `GET /api/events` streams Server-Sent Events named `pipeline.updated`, `exception.created`, and `escalation.created`.

## Start onboarding

`POST /api/onboarding` accepts:

```json
{
  "firstName": "Alex",
  "lastName": "Example",
  "email": "alex@example.test",
  "identityToken": "demo:identity-reference"
}
```

Send an `Idempotency-Key` header when retrying an offline submission. The backend returns a stable result for a repeated key, and rejects reuse of an email for a different onboarding request. The identity token is transient and must not be stored in pipeline metadata, audit records, or logs.

Every mock hard failure creates a human-review escalation. Configurable team/severity/action routes are supplied at backend startup; cases are not automatically assigned or sent to a person or government contact. All government, banking, travel, and logistics provider calls in this repository are mock adapters. Provider side effects are not performed.
