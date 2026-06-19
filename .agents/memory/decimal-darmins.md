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

## UI convention
All Darmin displays use `.toFixed(2)`: mobile (index, stats, timebank, tv screens), web (Home, Citizens, Shop, Layout, Tv pages).

## What stays integer
- `sessions.duration_seconds` — time counter, not monetary
- ID fields — foreign keys/primary keys
- `durationSeconds` in `transactions` — same reason
