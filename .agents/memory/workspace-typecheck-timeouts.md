---
name: Workspace typecheck timeouts
description: A practical verification constraint for this workspace's concurrent TypeScript checks.
---

When the root typecheck starts several artifact checks together, it can exceed the shell timeout without printing TypeScript diagnostics. In this workspace, checking the shared libraries first and then API, web, mobile, and mockup packages serially completed successfully.

**Why:** Parallel typechecks competed for resources and timed out twice, while the same checks passed when run package by package.

**How to apply:** If the aggregate typecheck stalls without reporting errors, avoid repeated identical runs; run `typecheck:libs` followed by each artifact's `typecheck` script serially.
