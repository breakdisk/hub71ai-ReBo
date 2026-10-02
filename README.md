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

The next-stage scope for cultural integration, tax/gratuity, human escalation, utilities, and disaster recovery is documented in [ROADMAP.md](ROADMAP.md). These domains are not production integrations in this prototype.

## GitHub Actions

Pull requests and pushes to `main` run the mobile type-check and tests, dashboard readiness checks and production build, Rust formatting/lint/unit checks, and a Windows-hosted API end-to-end smoke test. Dependabot checks GitHub Actions, Cargo, dashboard, and mobile dependencies weekly. Production deployment is not wired yet because a hosting target and deployment credentials/environment have not been selected.

For a dashboard-only browser smoke check while Rust is unavailable, run `node scripts/dev-mock-api.mjs` in one terminal and `pnpm run dev` from `dashboard/` in another. This in-memory fixture binds to loopback, accepts synthetic test data only, and is not a replacement for the Rust API smoke test.
