---
name: Timenaming license legal status
description: Legal wording decision for the TimeNation minute-placement license
---

The supplied disclaimer says “exclusive non-exclusive,” which is contradictory. Keep this phrase clearly marked as a draft pending legal review; do not present it as finalized terms.

**Why:** the user approved implementing the service while explicitly deferring this wording as draft text.

**How to apply:** Keep draft status visible in the Timenaming UI and certificate until the user supplies legally reviewed replacement wording.

Pricing and upgrade rules: a Timeline family-minute claim costs 1 Д; a direct all-inclusive Timeline + Timenaming + PDF + Sepolia NFT purchase costs 2 Д; upgrading an already-owned Timeline minute costs an additional 2 Д, for 3 Д total. Always leave the ancestral minute protected. Only the owner may upgrade; another citizen's claim is unavailable. A minute can be upgraded only once.

**Why:** the user confirmed that a Timenaming license should upgrade an existing Timeline claim rather than require a second reservation.

**How to apply:** Keep Timeline as the shared unique-coordinate registry. Direct bundle purchase must be gated on mint readiness, and an upgrade must validate ownership and charge atomically before issuing the license and NFT.

The user chose Pinata for IPFS pinning. The mint flow must pin the certificate PDF and metadata before sending the transaction, then pass an `ipfs://` metadata URI to the contract. Describe availability as dependent on continued pinning or independent replicas; do not promise permanent access. Sepolia is a test network, not mainnet.

**Why:** the user asked to implement IPFS before adding FAQ claims about decentralized storage and shutdown resilience.

**How to apply:** Gate minting on Pinata configuration and make the PDF/metadata CIDs visible after issuance. Keep Pinata credentials in Replit Secrets and never expose them to the client.
