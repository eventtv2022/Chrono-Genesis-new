---
name: Expo web font loading
description: Avoid FontFaceObserver timeouts in the Android Chrome browser preview.
---

In the Expo SDK 54 browser preview, bundled Google fonts can trigger a 6000 ms FontFaceObserver timeout on Android Chrome. Keep both `expo-font` and `@expo-google-fonts/inter` imports inside a native-only dynamic loading path; use system fallback fonts on web. Continue loading bundled Inter on iOS and Android, but let the app start with fallback fonts if native loading fails.

**Why:** A conditional native font gate was not sufficient while the font modules remained statically imported; Android Chrome still showed the timeout screen.

**How to apply:** If a mobile Expo browser preview throws a FontFaceObserver timeout, dynamically import and load fonts only from the native gate; keep web startup independent of font assets.
