---
name: Expo video web rendering
description: Workaround for Expo AV's oversized video frame in the mobile web preview.
---

For bounded local MP4s in the Expo mobile app, the Expo AV web renderer may display the video at intrinsic size and crop it even when `ResizeMode.CONTAIN` is set. Render the web version with a native HTML video element sized to its container and `object-fit: contain`; keep the Expo AV player with `ResizeMode.CONTAIN` on iOS and Android.

**Why:** This behavior was reproduced in the Replit Expo SDK 54 preview with a source clip whose sampled frames already showed the full flag.

**How to apply:** When displaying a local MP4 in a fixed-aspect-ratio mobile frame, check the web preview separately from native playback and use platform-specific rendering if Expo AV crops the web frame.
