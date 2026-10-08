---
name: Expo web font loading
description: Avoid FontFaceObserver timeouts in the Android Chrome browser preview.
---

In the Expo SDK 54 browser preview, loading bundled Google fonts through `@expo-google-fonts/inter` can trigger a 6000 ms FontFaceObserver timeout on Android Chrome. Skip custom font loading in the web path and allow system fallback fonts; keep loading bundled Inter on iOS and Android.

**Why:** The browser preview failed before the app could mount even though custom fonts are not required for startup.

**How to apply:** If a mobile Expo browser preview throws a FontFaceObserver timeout, bypass the web font map while preserving the native font-loading path.
