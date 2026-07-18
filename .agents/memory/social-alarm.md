---
name: Social Alarm feature
description: Key decisions and gotchas for the Social Alarm implementation (WS, i18n, mobile)
---

## WS auth — citizenId only, no authToken
Server accepts `{ type: "auth", citizenId }` — no authToken required. CitizenProfile is not exposed to clients, so no token to send. Any `!authToken` check in socialAlarmWs.ts must be removed.

**Why:** CitizenProfile type doesn't carry an auth token field on the client side; requiring one would lock every citizen out of WS.

**How to apply:** If WS auth is extended, keep citizenId as the only required field unless a proper token mechanism is added.

## Mobile i18n is separate from web i18n
Mobile has its own UIStrings interface in `artifacts/mobile/lib/i18n.ts` (3400+ lines, 24 language blocks).
Web has `artifacts/web/src/i18n/ui.ts`.
Any new i18n keys added to web must also be added to mobile separately.

**Why:** The two artifacts are independent — mobile doesn't import from web's i18n.

**How to apply:** When adding new UIStrings keys, always update both files. Use a Node.js script with `shop_payment_error` as the anchor (last key per lang block) — but match the full quoted string `shop_payment_error: "..."` not just the key name, because the interface definition line also contains `shop_payment_error:`.

## i18n script anchor pattern
When inserting translations at end of each lang block in mobile i18n.ts, use a regex like `/shop_payment_error: "([^"]*)"/g` and skip index < 400 to avoid the interface definition line. Insert in reverse order to preserve positions.

## Tables created
- `social_alarms` — alarm events (id, triggeredBy, triggeredAt, isGlobal)  
- `social_alarm_targets` — per-target delivery (alarmId, citizenId, deliveredAt)
- `socialAlarmConsent` column on `citizens` — boolean, default false

## WS endpoint
`/api/ws` — attached to the HTTP server via `attachSocialAlarmWs(server)` in `artifacts/api-server/src/index.ts`. API server must use `http.createServer(app)` not `app.listen()`.
