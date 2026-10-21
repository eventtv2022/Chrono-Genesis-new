---
name: TimeNation TRON WalletConnect checkout
description: Protocol and review constraints for direct USDT TRC20 checkout through WalletConnect.
---

TRC20 checkout must build the USDT contract call, request wallet approval with `tron_signTransaction`, and broadcast the signed transaction. WalletConnect sessions can require either the legacy v1 transaction payload or the wrapped v2 payload; inspect `tron_method_version` and send the matching shape.

The resulting TxID still goes through the existing server confirmation flow and administrator review. A client-side wallet approval or submitted TxID must never credit Darmins by itself.

**Why:** Reown's generic Tron `sendTransaction` path covers native TRX transfers, not USDT contract calls, and WalletConnect peers differ in transaction payload format.

**How to apply:** Preserve the configured treasury address, USDT TRC20 contract, server-generated quote, wallet-side transaction confirmation, and manual verification when changing this checkout.
