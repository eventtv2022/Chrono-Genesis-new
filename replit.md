# TimeNation — Chrono-Genesis

Цифровое государство, где время является валютой (Дармин = 1 минута). Граждане передают Дармины через TiMETR-сессии, накапливают Merit Score, занимают позиции в таймлайне, регистрируют Посольства и торгуют на P2P-аукционах.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить API сервер (порт 8080)
- `pnpm run typecheck` — полная проверка типов по всем пакетам
- `pnpm run typecheck:libs` — пересобрать lib-декларации (после изменений в `lib/db`)
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

- `lib/db/src/schema/` — источник истины для схемы БД:
  - `citizens` — граждане (+ tosAcceptedAt, rank=«Посол» для Земельного Фонда)
  - `sessions`, `transactions`, `timelineAnchors` — ядро TiMETR
  - `emissionLogs` — лог эмиссии Дарминов (Emission Gatekeeper)
  - `auctionLogs`, `auctions` — P2P-аукционы
  - `nationalEmbassies` — Земельный Фонд (ноды/посольства + NFT-метаданные)
- `lib/api-spec/openapi.yaml` — источник истины для API контракта
- `artifacts/api-server/src/routes/` — Express роуты (citizens, sessions, transactions, timeline, payments, wallet, embassies, auctions, emission)
- `artifacts/api-server/src/services/` — бизнес-логика (meritocracy, telegram, **emission**)
- `artifacts/api-server/src/lib/googleSheets.ts` — Google Sheets (Service Account, автосоздание листов)
- `artifacts/mobile/` — Expo мобильное приложение (5 вкладок: TiMETR, Таймлайн, Экономика, Посольства, Аукцион)
- Вспомогательные экраны: `shop.tsx`, `wallet.tsx`, `tos.tsx`, `register.tsx`
- `artifacts/api-server/src/services/tvService.ts` — TV: типы слотов, Burn Matrix, fingerprint, sovereign URL
- `artifacts/api-server/src/routes/tv.ts` — TV API (slots, book, capsule, schedule, sovereign lookup)
- `lib/db/src/schema/tvSlots.ts` — таблица `tv_slots` (1440/день, unique date+minuteIndex)
- `lib/db/src/schema/tvCapsules.ts` — таблица `tv_capsules` (seed, manifesto, 3 независимых измерения)

## Architecture decisions

- Дармин = валюта. 1 минута реального времени = 1 Дармин. Аббревиатура в UI: «Д».
- Каждый гражданин получает 60 Д при регистрации. Родовая минута (1 Д) не может быть передана.
- Merit Score накапливается за передачу Дарминов; энтропия (-0.5/нед) снижает ранг неактивных граждан.
- **Emission Gatekeeper**: лимит 350 Д/сутки по сети. При превышении — FIFO-очередь (scheduledFor = 00:00 UTC). Cron дрейнит очередь каждые сутки в 00:00 UTC.
- **Земельный Фонд**: гражданин предоставляет 1 м² под ноду. Получает ранг «Посол» + NFT-сертификат (JSON в БД). Пассивный доход в Дарминах за аптайм.
- **P2P-аукционы**: платформа — доска объявлений. 2% комиссии (Math.ceil). Дармины продавца блокируются при создании лота. Фиат в систему не входит.
- Stripe работает через checkout sessions + webhook (кредитует Дармины после оплаты).
- Telegram бот уведомляет граждан о транзакциях и позволяет привязать аккаунт по номеру телефона.
- Google Sheets логирование — подключено через Service Account (googleapis).
- **SQL View** `excel_export_view` — объединяет transactions + emission_logs + auction_logs для выгрузки в Excel.
- Terms of Service экран (`/tos`) — юридическая изоляция: Дармины = внутриигровые баллы, не деньги.
- **TimeNation-TV**: 1440 слотов/день (lazy generation при первом запросе). Burn Matrix: citizen 1Д/4.99€, quarter 10Д/9.99€, half 25Д/24.99€, apex 50Д/49.99€. Anti-consecutive guard (fingerprint). 3 измерения капсулы: broadcastPolicy (echo/noise/private), contentState (filled/empty), hasSovereignLink. Retro = slot_time < NOW.

## Product

- TiMETR сессии: передача Дарминов в реальном времени (старт/стоп таймер)
- Таймлайн: захват координат исторического времени (12-значный код YYYYMMDDHHmm)
- Экономика: рейтинги граждан, статистика циркуляции Дарминов
- Казначейство: пакеты 100/500/1000 Д через Stripe (в рублях)
- Web3 кошелёк: привязка EVM-адреса с верификацией подписи (ethers.js)
- Посольства: Земельный Фонд, ноды, NFT-сертификаты послов
- Аукцион: P2P-рынок Дарминов, 2% комиссия
- Ранги: Странник → Созидатель → Посол → Хранитель Времени → Вершитель Эпох → Архитектор Таймлайна

## User preferences

- Проект перенесён из GitHub репозитория eventtv2022/Chrono-Genesis-new
- Язык интерфейса: русский
- Секреты хранятся только в Replit Secrets, никогда в файлах

## Gotchas

- `GITHUB_TOKEN` нужен только для клонирования приватного репо, не для работы приложения
- `pnpm --filter @workspace/db run push` применяет схему без миграций — только для dev
- После добавления новых таблиц в `lib/db/src/schema/` — запустить `pnpm run typecheck:libs` перед typecheck артефакта
- Stripe apiVersion в payments.ts не нужно указывать явно — библиотека использует дефолт
- SF Symbols: `timer.fill` не существует в SFSymbols7_0, используй `timer`
- `logTransactionToSheets` принимает полные поля транзакции (не fromName/toName)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Все секреты: DATABASE_URL, SESSION_SECRET, TELEGRAM_BOT_TOKEN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Опциональные секреты (уже добавлены): GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_JSON
- Опциональный секрет: ADMIN_TELEGRAM_ID (числовой ID для /migratedata команды)
- Опциональный секрет: HF_TOKEN — HuggingFace API token (повышенные лимиты для text-to-video). Без него работает на free-tier лимитах.
