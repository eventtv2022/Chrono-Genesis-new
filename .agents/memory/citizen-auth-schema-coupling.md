---
name: Citizen auth schema coupling
description: A stale citizens table can cause broad auth failures when middleware selects the full Drizzle row.
---

Authentication middleware selects the entire citizens row. A single missing Drizzle column therefore causes every bearer-authenticated endpoint to fail before its route handler runs, including unrelated profile sections.

**Why:** This failure made timeline anchors, the video catalog, and referrals all fail together even though their endpoint implementations were unrelated.

**How to apply:** When many protected endpoints fail at once, inspect `requireAuth` and compare the live development schema with Drizzle before changing each endpoint. Sync the development schema through the supported workflow; do not add startup-time DDL or alter production directly.
