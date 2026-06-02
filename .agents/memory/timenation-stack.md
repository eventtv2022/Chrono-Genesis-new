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

## Known fixes applied
- `timer.fill` → `timer` в SF Symbols (SFSymbols7_0 не содержит timer.fill)
- Stripe `new Stripe(key)` без явного apiVersion (убрать Parameters<typeof Stripe> cast)
- `logTransactionToSheets` сигнатура: полные поля транзакции, не fromName/toName

**How to apply:** При изменении payments.ts не добавлять явный apiVersion через Parameters<typeof Stripe>.
