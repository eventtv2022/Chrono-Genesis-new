---
name: Upload boundary semantics
description: Inclusive user-facing upload limits differ from Busboy's byte threshold.
---

Treat the advertised attachment limit as inclusive, using binary megabytes consistently. With the current Multer/Busboy version, a file exactly equal to the configured `fileSize` is accepted and a larger file is rejected.

**Why:** The parser's boundary behavior differs by dependency version; the prior “limit plus one” workaround let an upload one byte over the advertised limit through after the runtime dependency update.

**How to apply:** Whenever changing an advertised upload limit or Multer/Busboy version, verify limit-minus-one, exact-limit, and limit-plus-one with the actual multipart parser rather than a mocked comparison. Check every consumer of shared size-limit translations, not just the screen being edited.
