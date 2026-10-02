# Agentic Global Mobility: safety and readiness roadmap

This roadmap adds the five identified gaps to the product plan. The current repository remains a local simulation: no partner, government, tax, utility, community, or cloud-failover integrations are active. Any UI fixture is synthetic and must be labeled as a demo. A green prototype indicator must never imply a real service, legal determination, payment, booking, or home activation.

## 1. Soft landing and cultural intelligence

**Product slice:** an opt-in arrival guide, locally reviewed micro-lessons, and a directory/referral flow for community and family support.

- Let the person choose city/neighborhood manually or skip personalization. Do not request background GPS. If precise location is ever added, gate it behind a separate, purpose-specific permission and keep the guide usable without it.
- Keep the default community profile private. Ask separately before sharing interests or family/community preferences with a vetted group or facilitator; allow withdrawal and deletion.
- Use locally reviewed, dated content. Cultural learning should explain context and offer choices, never score a person or infer beliefs, nationality, religion, or workplace fit.
- Do not automatically match spouses or children. Begin with user-selected directories and human-facilitated introductions; require explicit consent from each adult and guardian consent where applicable.

**Acceptance checks:** app works with no location permission; personalization is off until chosen; community details are not sent or logged without explicit opt-in; published advice has an owner, review date, and correction path.

## 2. Tax-residency tracking and end-of-service ledger

**Product slice:** a consent-based travel-day ledger, country-specific tax case tracking, and a gratuity/provision ledger with a versioned ruleset and visible source date.

- Record trip dates only from approved sources or employee-confirmed entries. Show evidence, corrections, time zones, and missing days. A day count is a fact record, not a residency decision.
- Do not use a blanket 90/183-day rule. The UAE Federal Tax Authority's Cabinet Decision 85 of 2022 describes a 183-day route and a 90-day route with additional status and residence/employment/business conditions, as well as a separate usual-residence and centre-of-interests route. Treaty and home-country rules must be evaluated separately by a qualified tax professional. See the [FTA decision page](https://tax.gov.ae/en/content/cabinet.decision.no.85.of.2022.on.determination.of.tax.residency.home.aspx) and its [published English translation](https://tax.gov.ae/Datafolder/Files/Legislation/Corporate%20Tax/Cabinet%20Decision%2085%20of%202022%20-%20For%20publishing.pdf), marked by the FTA as unofficial.
- Do not calculate one universal UAE gratuity. The [UAE Government private-sector guidance](https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/end-of-service-benefits-for-employees-in-the-private-sector) distinguishes employee/work arrangements and describes the voluntary Savings Scheme as an alternative. For the covered full-time foreign-worker route, it describes a one-year continuous-service threshold, last basic wage, 21/30-day accrual bands, pro-rating, unpaid absence treatment, and a two-year wage cap. Other work patterns, employer schemes, nationals, free zones, and special regimes need their own reviewed rules.
- Keep tax equalization calculations in a separate, versioned rules service. Require source country, destination, tax year, treaty profile, compensation components, travel evidence, and human review. Display assumptions and unresolved questions; never file, withhold, or settle automatically.
- Do not display an accrued gratuity amount when eligibility or scheme is unknown. Show “ruleset unavailable” and route to payroll/benefits review.

**Acceptance checks:** ruleset and sources are versioned; unsupported worker types produce no number; test vectors are reviewed against official guidance; every estimate shows inputs, effective date, assumptions, and approval state; calculations can be reconciled to payroll and corrected with an audit trail.

## 3. Human escalation matrix and war room

**Product slice:** convert exhausted retries, legal/identity mismatches, security holds, and provider timeouts into typed cases assigned to a specialist queue.

- Route by blocker code and jurisdiction to an owner such as immigration/PRO, payroll/tax, travel, family support, or home readiness. Each route defines severity, retry budget, service window, acknowledgement deadline, fallback owner, and evidence checklist.
- Preserve the failed saga step and its idempotency/side-effect state. Keep the pipeline visibly blocked until an authorized person records a resolution or approved compensation action.
- Keep government liaison contacts as a controlled human workflow. Never automatically send identity documents, make legal representations, or contact a government decision-maker. A qualified, authorized case manager reviews the request, recipient, payload, and purpose before using an approved channel.
- Audit case creation, assignment, acknowledgement, notes, approvals, handoffs, and closure; redact tokens and identity data from logs and event payloads.

**Acceptance checks:** every hard failure opens exactly one idempotent case; specialist routing and SLA are deterministic; missed acknowledgement escalates to a fallback human; unauthorized actions are blocked; case closure requires a resolution code and audit record.

## 4. Day-zero utilities and home readiness

**Product slice:** a home-readiness checklist for electricity/water, district cooling, telecom, and optional smart-home handover, coordinated with the lease and arrival date.

- Keep DEWA, Empower, telecom, movers, and smart-home systems behind provider adapters. No live call is made until the partner, service area, API permissions, and sandbox are approved.
- Require verified premises/lease details and explicit employer/occupant approval before activation, charges, appointment bookings, or utility-account changes. Show cost, service address, provider, and cancellation terms at approval time.
- Treat device credentials as high-privilege secrets: issue least-privilege, expiring access only after occupant consent; never make the app a permanent master key. Support revocation and transfer on move-out.
- Track each item as `not_ready`, `awaiting_approval`, `submitted`, `confirmed`, or `blocked`; a submitted request is not proof that service is active.

**Acceptance checks:** no charge or remote-control command before approval; retries cannot create duplicate service orders; confirmations are provider-sourced; failed activations create a human case; secrets do not enter analytics, audit messages, or exception text.

## 5. Multi-region resilience and failover

**Product slice:** regional deployment, health-based traffic management, durable events, tested restore/failover, and a declared recovery objective per service and data class.

- First establish a single-region production baseline with durable database backups, event replay, idempotent consumers, provider-side idempotency, and tested recovery. Set RPO/RTO from business impact and prove them in drills; do not advertise “near zero” before measuring it.
- Design active-active only for components that can safely reconcile concurrent writes and external side effects. Use a transactional outbox, unique idempotency constraints, conflict policy, and a single-owner/lease mechanism for non-idempotent provider actions.
- Classify data before selecting a DR geography. Keep raw identity documents and high-risk identifiers in the approved residency boundary by default; replicate only the minimum encrypted data needed for recovery after privacy, contractual, and jurisdictional review.
- Health checks must include API, database, queue lag, event delivery, provider adapter circuit state, and mobile outbox status. DNS/global traffic management may shift traffic only after the target region is ready and has current, policy-approved data.

**Acceptance checks:** documented recovery objectives are met in a game day; no duplicate government/banking/utility side effects occur during failover; stale replicas are detected; tenant routing respects configured data policy; restore and rollback paths are operator-tested.

## Delivery sequence

1. Ship consented soft-landing content and the specialist escalation/case workflow against synthetic fixtures.
2. Add the travel-day evidence ledger and payroll fields, then validate jurisdiction profiles with tax and employment counsel before calculating or provisioning any amount.
3. Add utility/home readiness adapters in provider sandboxes with explicit approval gates.
4. Establish single-region durable recovery and measure RPO/RTO; proceed to multi-region only after data-residency review and failover drills.

All five slices remain marked **prototype / not connected** until the applicable content review, legal review, provider agreements, privacy controls, and operational tests pass.
