---
name: TimeNation stack & secrets
description: Ключевые факты о проекте Chrono-Genesis/TimeNation для следующих сессий
---

# TimeNation — Chrono-Genesis

**Why:** Проект перенесён из приватного GitHub репо eventtv2022/Chrono-Genesis-new в Replit.

## Secrets (все добавлены в Replit Secrets)
- DATABASE_URL — автоматически от Replit PostgreSQL
- SESSION_SECRET — есть
- TELEGRAM_BOT_TOKEN — есть, бот запускается при старте сервера
- STRIPE_SECRET_KEY — есть
- STRIPE_WEBHOOK_SECRET — есть
- GOOGLE_SHEETS_ID — опционально (заглушка в googleSheets.ts)

## Google Sheets — реестр граждан
- Production database is the source of truth for the citizen sheet; development must not write citizen rows.
- Keep old/unmatched rows and mark them unverified rather than deleting them automatically.
- Match rows using internal citizen ID plus phone; passport number is editable, and internal IDs can overlap between environments.

**Why:** The user wants the sheet aligned to production, and existing rows include reused internal IDs across environments.

**How to apply:** Run a protected full snapshot from the production admin registry. Preserve ambiguous legacy rows for review; never treat the spreadsheet as authoritative for database records.

## Crypto gateway (Cryptomus) — добавлен
- Сервис: `artifacts/api-server/src/services/cryptomusService.ts`
- Endpoint: `POST /api/tv/slots/book-crypto` — создаёт Cryptomus USDT/USDC payment
- Webhook: `POST /api/tv/crypto/webhook` — подтверждает слот при статусе "paid"
- **Нужны secrets**: `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_API_KEY` (Payment key, не Payout)
- Без них endpoint возвращает 503 (graceful degradation)

## Stripe billing descriptor (обновлён)
- Все Stripe checkout sessions: `"Compute-Time Utility Token — TimeNation SaaS Infrastructure"`
- Старый "Внутриигровые баллы" заменён везде (tv.ts + payments.ts)
- **Why:** предотвращение suspension merchant account Stripe

## DB schema tvSlots — новые колонки
- `cryptoPaymentUuid` — Cryptomus UUID для matching webhook
- `paymentStatus` — pending | completed | refunded
- `billingDescriptor` — exact label из checkout

## Mobile Catcast
- `openCatcast` использует `expo-web-browser.openBrowserAsync` (fullscreen in-app browser)
- Плавнее чем `Linking.openURL` для видеостриминга

## Known fixes applied
- `timer.fill` → `timer` в SF Symbols (SFSymbols7_0 не содержит timer.fill)
- Stripe `new Stripe(key)` без явного apiVersion
- `logTransactionToSheets` сигнатура: полные поля транзакции, не fromName/toName
- `statement_descriptor_suffix` не существует в этой версии Stripe SDK — не добавлять

**How to apply:** При изменении payments.ts не добавлять явный apiVersion через Parameters<typeof Stripe>.
