---
name: Public dashboard privacy
description: TimeNation's public dashboards and statistics must not identify individual citizens.
---

Public dashboards show aggregate activity only. Do not publish citizen-level rankings, passport numbers, or individual transaction rows. Personal balances and histories belong behind sign-in. All-time counts and transfer totals must aggregate the complete transaction history, not a recent-page sample.

**Why:** the user requires citizen personal data to remain private and wants public statistics to describe the system, not individual behavior.

**How to apply:** when changing public dashboard UI or API responses, expose only aggregates; keep citizen-specific data behind authenticated, ownership-scoped endpoints and use full-history database aggregates for lifetime metrics.
