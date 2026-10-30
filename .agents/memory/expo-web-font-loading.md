---
name: Expo web font loading
description: Avoid FontFaceObserver timeouts in the Android Chrome browser preview.
---

In the Expo SDK 54 browser preview, bundled Google fonts and `@expo/vector-icons` can trigger a 6000 ms FontFaceObserver timeout on Android Chrome. Keep `expo-font` and `@expo-google-fonts/inter` imports inside a native-only dynamic loading path; use system fallback fonts on web. Replace `@expo/vector-icons` with SVG icons in the web-only Metro resolver, because each mounted vector icon loads its font through `expo-font`. Continue loading bundled Inter and vector icon fonts on iOS and Android, but let the app start with fallback fonts if native loading fails.

**Why:** A conditional native font gate was not sufficient while a mounted `@expo/vector-icons` component still called `Font.loadAsync` in the browser; Android Chrome still showed the timeout screen.

**How to apply:** If a mobile Expo browser preview throws a FontFaceObserver timeout, dynamically import and load app fonts only from the native gate, and route web icon imports to SVG replacements; keep browser startup independent of font assets.
