---
name: Professional documents and service catalog
description: Privacy and pricing rules for citizen CVs, portfolios, professional audits, and service listings.
---

Citizen CV and portfolio files are private by default. The owner may independently allow or deny viewing of each file by signed-in TimeNation citizens; never expose file bytes through public endpoints or public links. Authenticated downloads must check the current visibility flag on every request. Turning visibility off blocks future downloads, but cannot revoke copies already saved by viewers. AI consent is separate: the auditor may receive documents only after explicit consent and only to assess relevant qualifications and experience. Removing a file also disables its visibility and prevents later audits from using it.

Citizens can review and change the AI-recommended listing price before publishing; the chosen price is separate from the fixed 1 Д publication fee. Keep the fee charged atomically with listing creation and idempotent across request retries.

**Why:** The user asked for private professional documents to inform audits, per-file visibility for authenticated citizens, a fixed 1 Д publication fee, and control over the advertised service price before publication.

**How to apply:** Preserve separate AI-consent and citizen-visibility controls whenever adding document previews, profile sharing, audit history, service editing, or other catalog interactions.
