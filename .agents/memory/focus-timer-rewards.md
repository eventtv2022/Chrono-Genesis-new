---
name: Focus timer rewards
description: Product rules for focus-session and TimeNation quiz rewards
---

A focus session of at least 12 minutes can earn 1 Darmin only after its report contains at least one complete sentence related to the saved focus topic. The server-side AI auditor checks that relationship; missing, unrelated, or unauditable reports must not earn a Darmin. Use the Time Matrix task title as the topic, or the citizen-entered topic for a regular timer. Focus and quiz rewards share a 12-Darmin rolling 24-hour cap and a 12-minute cooldown. Every 12 correct TimeNation quiz answers can earn 1 Darmin when eligible.

**Why:** the user changed the focus-report policy on 2026-11-04 and explicitly requires an AI relevance check before reward issuance.

**How to apply:** Calculate eligibility from server-measured sessions and the shared reward ledger; fail closed if sentence or AI relevance validation fails. Anti-cheat flags suspend issuance until admin review. TimeNaming NFT issuance is an independent feature and remains on Sepolia; do not tie it to this game.
