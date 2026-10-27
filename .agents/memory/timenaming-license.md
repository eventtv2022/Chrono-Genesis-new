---
name: Timenaming license legal status
description: Legal wording decision for the TimeNation minute-placement license
---

The user supplied five Russian clauses for the Timenaming placement license. The license is explicitly non-exclusive; do not add exclusivity, investment, ownership, or permanence guarantees beyond the provided terms. Localized translations are machine translations and need qualified legal review.

**Why:** the user replaced the contradictory draft with a specific Russian agreement and requested platform-wide localization.

**How to apply:** Preserve the Russian source wording in legal materials, label translations as requiring legal review, and keep public FAQ claims aligned with the actual Sepolia and IPFS implementation.

When Russian is selected, localize the entire Timenaming page, including its hero, form controls, status messages, empty states, help section, and footer. Keep product names and technical standards such as TimeNation, Sepolia, NFT, and IPFS in their established forms.

**Why:** the user explicitly requested that the Russian version of the page be fully Russian after seeing English interface copy.

**How to apply:** Check all visible copy and accessible labels in the Russian experience; do not assume that translating only the legal section is sufficient.

Pricing and upgrade rules: a Timeline family-minute claim costs 1 Д; a direct all-inclusive Timeline + Timenaming + PDF + Sepolia NFT purchase costs 2 Д; upgrading an already-owned Timeline minute costs an additional 2 Д, for 3 Д total. Always leave the ancestral minute protected. Only the owner may upgrade; another citizen's claim is unavailable. A minute can be upgraded only once.

**Why:** the user confirmed that a Timenaming license should upgrade an existing Timeline claim rather than require a second reservation.

**How to apply:** Keep Timeline as the shared unique-coordinate registry. Direct bundle purchase must be gated on mint readiness, and an upgrade must validate ownership and charge atomically before issuing the license and NFT.

When a citizen checks a minute they already captured, take them straight to the NFT-upgrade flow instead of asking them to reserve it again.

**Why:** the user requested this behavior for previously captured minutes.

**How to apply:** Resolve minute ownership through the authenticated availability check, show the NFT details and confirmation action for the citizen's own reservation, and never offer an upgrade for another citizen's reservation.

The user chose Pinata for IPFS pinning. Only the successfully minted NFT flow pins its certificate PDF and metadata before sending the transaction, then passes an `ipfs://` metadata URI to the contract; ordinary placement certificates are not automatically IPFS-pinned. Describe availability as dependent on continued pinning or independent replicas; do not promise permanent access. Sepolia is a test network, not mainnet.

**Why:** the user asked to implement IPFS before adding FAQ claims about decentralized storage and shutdown resilience.

**How to apply:** Gate minting on Pinata configuration and make the PDF/metadata CIDs visible after issuance. Keep Pinata credentials in Replit Secrets and never expose them to the client.

NFT minutes may include one public photo or audio/video file; audio and video must be no longer than 60 seconds.

**Why:** the user requested uploading photo, audio, or video to an NFT minute.

**How to apply:** Validate actual media bytes and duration on the server, pin the media and metadata to IPFS, and make the public nature clear before upload.
