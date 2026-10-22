---
name: TimeNation age gate
description: Product policy for age tiers, child registration, and KYC-restricted features.
---

Block new registrations for anyone under 13 before creating an account or persisting their date of birth. Derive and store age tiers server-side from DOB; never trust a client-supplied tier. Teens retain educational access, while financial, Web3, DAO, and unmoderated public publishing actions are denied server-side as specified. KYC-required adult features remain denied until the official Freedom Bank KYC flow is connected; never simulate verification or expose a client-settable KYC flag. Engineering controls do not certify legal compliance.

On Telegram entry, show the format-selection screen before authentication or any date-of-birth validation. Start Telegram Mini App authentication only after the visitor chooses the mobile version; keep desktop web and official-site links available from that screen.

**Why:** This is the user's stated age-safety policy. They designated Freedom Bank as the official KYC provider; no usable connection or flow is currently present.

**How to apply:** Reuse these rules on every registration and protected API path. Keep legacy accounts without a valid DOB unclassified and deny age-restricted features until a safe completion flow exists. Preserve the Telegram format-selection screen before starting registration or authentication.
