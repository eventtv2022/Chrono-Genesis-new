---
name: Public dashboard and citizen-card privacy
description: Public statistics stay aggregate; the passport card has a narrow exception for merit and authored public activity.
---

Public dashboards show aggregate activity only. The passport-number citizen card is an explicit exception: it may show rank and merit score, time milestones, the citizen's currently active Darmin auctions, and non-deleted Chronopedia entries authored by that citizen. Do not expose balance, contact details, identity data, or private history. All-time counts and transfer totals must aggregate the complete transaction history, not a recent-page sample.

**Why:** the user requested these specific public fields for the citizen card while the existing privacy rule still protects balances and personal identity.

**How to apply:** keep this exception limited to the passport-number card and only public/active authored records. Do not generalize it to other public endpoints; keep citizen balances and private history behind authenticated, ownership-scoped endpoints.
