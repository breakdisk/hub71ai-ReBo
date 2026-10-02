# Global Relocation & Onboarding Engine

[![CI](https://github.com/breakdisk/hub71ai-ReBo/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/breakdisk/hub71ai-ReBo/actions/workflows/ci.yml)

A local development prototype for employee relocation workflows to the UAE. It includes a Rust API and saga backend, an exception-focused operations dashboard, and a local-first mobile client.

## Development status

This repository is a simulation-ready prototype. Government, banking, travel, and logistics integrations must use mock adapters until approved partner credentials, legal review, data-processing agreements, and sandbox access are configured. Never use real passport or identity data in local development. The identity field accepted by the API is a synthetic, tokenized reference; raw documents and passport numbers are not part of the API contract.

## Projects

- `backend/` — Rust API gateway, workflow orchestration, mock provider adapters, and persistence interfaces.
- `dashboard/` — operations mission control for pipelines and actionable exceptions.
- `mobile/` — Expo client with local-first draft/outbox storage and background synchronization.

See each project README for its run commands and configuration. The dashboard and mobile app default to `http://localhost:8080` for the backend.

The five gap areas in [ROADMAP.md](ROADMAP.md) now have local prototype flows: optional soft-landing guidance, a consented travel and compensation evidence ledger, human case acknowledgment and resolution, lease and resident-approval gates for home readiness, and tabletop resilience reviews. Legal calculations remain unavailable without approved rulesets; utility adapters and regional failover remain unconfigured. The API is in-memory and loopback-only, and no production integrations or external actions are active.

## GitHub Actions

Pull requests and pushes to `main` run the mobile type-check and tests, dashboard readiness checks and production build, Rust formatting/lint/unit checks, and API end-to-end smoke tests on Windows and in Docker Compose. Dependabot checks GitHub Actions, Cargo, dashboard, and mobile dependencies weekly. A production deployment target and credentials have not been selected, so CI does not publish or deploy the service.

The root `docker-compose.yml` is for local backend verification. It uses host networking so the backend can keep its loopback-only bind policy; on Docker Desktop, enable host networking if the container cannot start. The backend is an unauthenticated in-memory demo; do not attach a public domain until authentication and production storage are implemented.

For a dashboard-only browser smoke check while Rust is unavailable, run `node scripts/dev-mock-api.mjs` in one terminal and `pnpm run dev` from `dashboard/` in another. This in-memory fixture binds to loopback, accepts synthetic test data only, and is not a replacement for the Rust API smoke test.
