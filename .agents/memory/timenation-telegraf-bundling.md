---
name: Telegraf and esbuild
description: Preserve Telegraf long-polling compatibility in the API server's esbuild output.
---

Keep Telegraf external to the API server esbuild bundle. Its polling uses an `abort-controller` shim, and node-fetch v2 validates the signal by checking the signal prototype constructor name. Bundling can rename that constructor and cause polling to fail with an AbortSignal TypeError even though the package works when loaded directly.

**Why:** The bundled API reproduced a launch failure that disappeared when Telegraf and its dependency graph loaded through Node's normal package resolution.

**How to apply:** Preserve Telegraf as a runtime dependency when changing API bundling, and retain an offline local-stub test that exercises both `getUpdates` and `sendMessage`.
