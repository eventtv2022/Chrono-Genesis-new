---
name: Decimal Darmins migration
description: Все денежные поля переведены с integer на real (PostgreSQL REAL / JS number). Налог 2% — точная дробь без Math.round/Math.ceil.
---

## Rule
All Darmin balance and amount fields use Drizzle `real` type (PostgreSQL REAL → JS number). Tax is computed as `amount * 0.02` with no rounding. UI formats all Darmin amounts with `.toFixed(2)`.

## Affected DB columns (real type)
- `citizens.balance_minutes`, `citizens.total_given`, `citizens.total_received`
- `transactions.minutes_transferred`
- `sessions.minutes_transferred`
- `time_bank_loans.amount`, `time_bank_loans.remaining_debt`
- `time_bank_ledger.amount`
- `emission_logs.amount`, `emission_logs.daily_total` (already real before)

## Tax calculation
`calcTreasuryTax(amount)` in `videoStorage.ts` returns `amount * TREASURY_TAX_RATE` (0.02) — no Math.round or Math.ceil.
Same applies to auctions.ts `tax = finalPrice * 0.02`.

**Why:** 1 Д transaction was charging 100% tax when Math.ceil(1 * 0.02) = Math.ceil(0.02) = 1. Now 1 Д → 0.02 Д tax.

## Timenaming NFT purchase fee
Apply the standard 2% treasury fee to the 2 Д NFT license purchase and upgrade (0.04 Д); plain 1 Д timeline reservations are not NFT purchases. Credit treasury citizen #1 and keep the fee auditable. If a mint fails, reverse the fee and refund the full 2.04 Д while preserving a pre-existing timeline claim.

**Why:** the user confirmed that TimeNation's 2% fee must apply to primary NFT-minute purchases as well as the separate ERC-2981 resale royalty.

**How to apply:** Keep primary purchase fees distinct from secondary-sale royalties; use the standard decimal tax calculation and make all failed-mint refund paths reverse the treasury credit.

## UI convention
Darmin amounts generally use `.toFixed(2)`. Exception: the mobile “D in circulation” KPI uses `.toFixed(3)` to fit its stat card while avoiding floating-point tails. Calculations and stored amounts retain full precision.

**Why:** the user requested thousandth precision for this KPI so its value does not overflow the card.

**How to apply:** Keep the three-decimal formatting limited to the circulation KPI; do not round balances or alter monetary calculations.

## What stays integer
- `sessions.duration_seconds` — time counter, not monetary
- ID fields — foreign keys/primary keys
- `durationSeconds` in `transactions` — same reason
