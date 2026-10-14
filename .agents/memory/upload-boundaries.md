---
name: Upload boundary semantics
description: Inclusive user-facing upload limits differ from Busboy's byte threshold.
---

Treat the advertised attachment limit as inclusive, using binary megabytes consistently.

**Why:** Real multipart tests showed that multer/Busboy rejects a file exactly equal to its configured fileSize, unlike a client check using `size > limit`.

**How to apply:** Whenever changing an advertised upload limit, verify limit-minus-one, exact-limit, and limit-plus-one with the actual multipart parser rather than a mocked comparison. Check every consumer of shared size-limit translations, not just the screen being edited.
