---
name: TimeNation Roadmap phases
description: Ключевые архитектурные решения по 5 фазам роадмапа — Дармин, EmissionGatekeeper, Посольства, Аукционы, Compliance
---

## Дармин = Минута (Phase 1)
UI-аббревиатура: «Д» (не «мин»). В БД поле по-прежнему `balanceMinutes`. После добавления новых schema-файлов в lib/db — обязательно `pnpm run typecheck:libs` перед typecheck артефакта.

**Why:** Старый `dist/` не знает о новых таблицах пока не перестроен.

## Emission Gatekeeper (Phase 2)
Лимит 350 Д/сутки по всей сети. При превышении — `emissionLogsTable` с `isApproved=false`, `scheduledFor=следующий 00:00 UTC` (FIFO). Cron-дрейн в `index.ts` каждые сутки в 00:00 UTC.

**How to apply:** Вызывать `requestEmission(citizenId, amount, reason)` из emissionService.ts при любом начислении вне TiMETR-сессий (Stripe-покупка, пассивный доход нод).

## Земельный Фонд / Посольства (Phase 3)
Таблица `national_embassies`. При регистрации посольства — ранг гражданина повышается до «Посол» (если был ≤ Созидатель). NFT-сертификат = JSON в поле `nft_metadata`. Один гражданин = одно посольство (уникальность по citizenId).

## P2P-аукционы (Phase 4)
Таблицы `auctions` + `auction_logs`. При создании лота — Дармины продавца немедленно блокируются (списываются с баланса). Комиссия 2% = `Math.ceil(finalPrice * 0.02)`. Родовая минута (1 Д) не блокируется: `amountDarmins <= balanceMinutes - 1`.

## Compliance Shield (Phase 5)
- `citizens.tos_accepted_at` — поле для фиксации принятия ToS.
- SQL View `excel_export_view` — объединяет transactions + emission_logs + auction_logs.
- ToS экран: `/tos` в mobile (Expo), Дармины = «внутриигровые баллы», не деньги.
- Юридическая формулировка в Stripe: «Внутриигровые баллы (Дармины)... Не являются деньгами или ценными бумагами».
