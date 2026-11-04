# Threat Model

## Project Overview

TimeNation is a citizen time-bank application with web and Expo clients, an Express API, and PostgreSQL. It supports account registration, passport issuance, Darmin balances and transfers, paid purchases, focus and quiz rewards, labor deposits, Telegram WebApp registration, and administrative actions.

## Assets

- **Darmin balances and issuance records** — unauthorized credits undermine the time-bank ledger and can be spent or transferred.
- **Citizen identity and credentials** — account tokens, password hashes, contact details, passport data, and uploaded photos could enable impersonation or expose personal information.
- **Reward and labor records** — focus sessions, quiz answers, and labor deposits determine whether non-purchased Darmins are issued.
- **Security events and administrator access** — review records support response to abuse; admin Telegram identity can block accounts or clear issuance holds.
- **Application secrets** — session signing, Telegram, AI, payment, and encryption secrets grant access to authentication, integrations, or protected data.

## Trust Boundaries

- **Web/mobile/TWA client to API** — all submitted IDs, session state, timing, task text, and registration fields are untrusted. Server-side authentication and ownership checks must decide who can mutate records or receive rewards.
- **API to PostgreSQL** — the API holds broad database access. Balance changes, eligibility checks, and replay protection must be atomic and parameterized.
- **API to external services** — Telegram, AI auditors, email, and payment providers can fail or return invalid data. Their responses must be verified and failures must not silently grant value.
- **Citizen to administrator** — account-level abuse signals and security events are reviewed through authenticated admin Telegram callbacks; normal users must not be able to clear holds or block accounts.
- **Development to production** — schema and configuration may differ between environments; production database changes must follow the supported publish flow.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`
- Highest-risk issuance and security logic: `artifacts/api-server/src/routes/citizens.ts`, `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/routes/twa.ts`, `artifacts/api-server/src/services/`
- Shared database schema: `lib/db/src/schema/`
- Public routes include registration, TWA authentication, and citizen applications; citizen mutations require authentication; admin controls are verified in Telegram callbacks and protected admin routes.
- `artifacts/mockup-sandbox/` is a component preview app and is not a production business API surface.

## Threat Categories

### Spoofing

An attacker could submit another citizen's ID or replay Telegram WebApp data to register or trigger issuance. Protected reward and labor routes must derive identity from the authenticated session, validate Telegram `initData` signatures before trusting Telegram user IDs, and make issuance transitions idempotent.

### Tampering

Clients can alter task, timer, quiz, labor, and balance-related request fields. The server must validate inputs, enforce ownership and eligibility, and apply balance changes with database transactions/locks. Client-provided timing or citizen identifiers must never independently authorize a reward.

### Repudiation

Repeated abuse, reward blocks, and administrator decisions need durable records with timestamps and actor identity. Security events must be reviewable, and clearing or blocking a citizen must record which authenticated administrator acted.

### Information Disclosure

Citizen identity, contact, passport, and file data must remain scoped to authorized users and stored outside public paths where appropriate. Logs and security alerts should avoid exposing credentials, tokens, full contact data, or uploaded document contents.

### Denial of Service

Public registration and expensive AI-backed operations can be spammed, while authenticated clients can rapidly create sessions, quiz attempts, and tasks. Rate limits should be persisted across API instances and keyed by verified account/contact identity; do not trust forwarded client-IP headers without an established trusted proxy boundary. AI/service failure must fail closed for value issuance.

### Elevation of Privilege

Missing authentication or object ownership checks could let callers earn value for another citizen or access administrative controls. Every protected operation must enforce server-side authorization; Telegram callbacks must verify the configured administrator identity before changing account status or security flags.
