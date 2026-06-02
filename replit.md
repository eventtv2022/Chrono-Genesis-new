# TimeNation — Chrono-Genesis

Цифровое государство, где время является валютой. Граждане передают минуты друг другу через TiMETR-сессии, накапливают Merit Score, занимают позиции в таймлайне и покупают минуты через Stripe.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить API сервер (порт 8080)
- `pnpm run typecheck` — полная проверка типов по всем пакетам
- `pnpm run build` — typecheck + сборка всех пакетов
- `pnpm --filter @workspace/api-spec run codegen` — регенерировать API хуки и Zod схемы из OpenAPI спека
- `pnpm --filter @workspace/db run push` — применить изменения схемы БД (только dev)
- Required env: `DATABASE_URL` — Postgres connection string (предоставляется Replit автоматически)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (из OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo (React Native) — `artifacts/mobile`
- Payments: Stripe (checkout sessions + webhooks)
- Notifications: Telegraf (Telegram bot)

## Where things live

- `lib/db/src/schema/` — источник истины для схемы БД (citizens, sessions, transactions, timelineAnchors)
- `lib/api-spec/openapi.yaml` — источник истины для API контракта
- `lib/api-zod/src/generated/` — Zod схемы (генерируются из OpenAPI)
- `lib/api-client-react/src/generated/` — React Query хуки (генерируются из OpenAPI)
- `artifacts/api-server/src/routes/` — Express роуты
- `artifacts/api-server/src/services/` — бизнес-логика (meritocracy, telegram)
- `artifacts/api-server/src/lib/googleSheets.ts` — заглушка Google Sheets (готова к подключению)
- `artifacts/mobile/` — Expo мобильное приложение

## Architecture decisions

- Время — основная валюта. 1 минута реального времени = 1 минута в балансе гражданина.
- Каждый гражданин получает 60 минут при регистрации. Родовая Минута (1 мин) не может быть передана.
- Merit Score накапливается за передачу времени; энтропия (-0.5/нед) снижает ранг неактивных граждан.
- Stripe работает через checkout sessions + webhook (кредитует минуты после оплаты).
- Telegram бот уведомляет граждан о транзакциях и позволяет привязать аккаунт по номеру телефона.
- Google Sheets логирование — подключено через Service Account (googleapis). Листы «Транзакции» и «Таймлайн» создаются автоматически при первой записи.

## Product

- TiMETR сессии: передача минут в реальном времени (старт/стоп таймер)
- Таймлайн: захват координат исторического времени (12-значный код YYYYMMDDHHmm)
- Экономика: рейтинги граждан, статистика циркуляции минут
- Магазин минут: пакеты 100/500/1000 мин через Stripe (в рублях)
- Web3 кошелёк: привязка EVM-адреса с верификацией подписи (ethers.js)
- Ранги: Странник → Созидатель → Хранитель Времени → Вершитель Эпох → Архитектор Таймлайна

## User preferences

- Проект перенесён из GitHub репозитория eventtv2022/Chrono-Genesis-new
- Язык интерфейса: русский
- Секреты хранятся только в Replit Secrets, никогда в файлах

## Gotchas

- `GITHUB_TOKEN` нужен только для клонирования приватного репо, не для работы приложения
- `pnpm --filter @workspace/db run push` применяет схему без миграций — только для dev
- Stripe apiVersion в payments.ts не нужно указывать явно — библиотека использует дефолт
- SF Symbols: `timer.fill` не существует в SFSymbols7_0, используй `timer`
- `logTransactionToSheets` принимает полные поля транзакции (не fromName/toName)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Все секреты: DATABASE_URL, SESSION_SECRET, TELEGRAM_BOT_TOKEN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Опциональные секреты (уже добавлены): GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_JSON
