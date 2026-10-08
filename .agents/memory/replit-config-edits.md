---
name: Replit config edits
description: Workspace-specific requirement for changing the root Replit configuration.
---

Change `.replit` through Replit's schema-validated replacement callback using a full temporary TOML file; direct file edits are rejected.

**Why:** the workspace protects Replit runtime configuration from unvalidated changes.

**How to apply:** For any `.replit` edit, prepare the full updated config in a temporary workspace file and replace it through the validated callback.
