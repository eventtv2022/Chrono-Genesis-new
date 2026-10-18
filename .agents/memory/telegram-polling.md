---
name: Telegram polling lifecycle
description: Telegraf long-poll retry and failure behavior relevant to bot recovery.
---

Telegraf's long-polling loop retries `FetchError`, HTTP 429, and HTTP 5xx errors internally, without exposing a polling-error event. Terminal failures such as polling conflicts escape through the `launch()` promise.

**Why:** Polling failures otherwise either remain hidden in Telegraf's internal retry loop or terminate the polling loop without restarting it.

**How to apply:** When maintaining Telegram polling, inspect the installed Telegraf version and observe both `getUpdates` request failures and the lifetime of `launch()`. Keep status free of bot credentials and distinguish internally retried errors from terminal errors.
