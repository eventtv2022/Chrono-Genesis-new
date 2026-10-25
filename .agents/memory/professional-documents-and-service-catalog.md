---
name: Professional documents and service catalog
description: Privacy and pricing rules for citizen CVs, portfolios, professional audits, and service listings.
---

Citizen CV and portfolio files are private profile data. They must not be exposed through public profile or catalog endpoints. The AI auditor may receive the documents only after the citizen explicitly consents, and only to assess relevant qualifications and experience; other citizens see a short assessment, never the source files. Removing the files must prevent later audits from using them.

Publishing a service listing costs 1 Д, separate from the AI-recommended service price. Keep the fee charged atomically with listing creation and idempotent across request retries.

**Why:** The user asked for private professional documents to inform both TiMETR deal audits and published service offers, with a fixed 1 Д catalog publication fee.

**How to apply:** Preserve consent and access boundaries whenever adding document previews, profile sharing, audit history, service editing, or other catalog interactions.
