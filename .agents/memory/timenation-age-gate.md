---
name: TimeNation age gate
description: Product policy for age tiers, child registration, and KYC-restricted features.
---

Block new registrations for anyone under 13 before creating an account or persisting their date of birth. Derive and store age tiers server-side from DOB; never trust a client-supplied tier. Teens retain educational access, while financial, Web3, DAO, and unmoderated public publishing actions are denied server-side as specified. KYC-required adult features remain denied until a real KYC flow exists; never simulate verification or expose a client-settable KYC flag. Engineering controls do not certify legal compliance.

**Why:** This is the user's stated age-safety policy, and the project has no real parental-consent or KYC provider flow.

**How to apply:** Reuse these rules on every registration and protected API path. Keep legacy accounts without a valid DOB unclassified and deny age-restricted features until a safe completion flow exists.
