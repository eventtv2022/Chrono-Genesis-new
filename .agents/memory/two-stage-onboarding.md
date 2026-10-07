---
name: Two-stage onboarding
description: TimeNation's revised guide, application, simulator, and passport eligibility flow.
---

Visitors complete the interactive guide before applying. The application starts the server-owned `availableAt` deadline; the simulator finale occurs at `availableAt - 1 minute`. At eligibility, passport issuance, the pending-to-issued transition, the one-time ancestral DarMin credit, and its ledger entry are atomic and idempotent. Pending applicants cannot enter the main app. Existing citizens retain their historical balance and are not credited again.

**Why:** the user revised onboarding from a tutorial-only experience to a two-stage application flow with passport issuance at eligibility.

**How to apply:** Keep the web, Telegram Mini App, and native mobile paths aligned. Treat PostgreSQL `availableAt` and the issuance service as authoritative; never use simulator completion itself to issue the passport.
