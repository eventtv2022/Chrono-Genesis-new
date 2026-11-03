---
name: Souvenir DarMin auction custody
description: Custody and settlement policy for auctioning souvenir DarMin NFTs.
---

## Rule
The user approved platform-controlled escrow for souvenir NFT auctions. A listed NFT is held by the TimeNation Sepolia relayer until it is returned to the issuer or delivered to the winning bidder.

**Why:** the user explicitly chose transfer to platform escrow over seller-retained, manually settled auctions.

**How to apply:** Verify the token is in the escrow wallet before listing. Return it on cancellation without bids, expiry without bids, or when the winning bid cannot be settled; transfer it to the winner only after successful settlement. Keep failed on-chain delivery recoverable and never imply that listing is non-custodial.
