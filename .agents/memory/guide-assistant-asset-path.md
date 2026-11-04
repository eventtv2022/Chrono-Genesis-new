---
name: Bundled API guide asset
description: Runtime path behavior for guide Markdown copied into the API build.
---

The API build copies the guide into `dist/assets`, and the bundled server entrypoint runs from `dist/index.mjs`. Resolve that asset relative to the bundled entrypoint (`./assets/...`); a parent-relative path can silently target a nonexistent source-level `assets` directory.

**Why:** production requests failed with `ENOENT` even though the build had copied the file successfully.

**How to apply:** When changing guide asset loading or API build output, verify the URL from the built `dist/index.mjs` location and check that the copied file is present there.
