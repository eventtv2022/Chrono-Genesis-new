---
name: Drizzle schema preservation
description: Protect active tables that are used through raw SQL when synchronizing the Drizzle schema.
---

The development PostgreSQL database can contain active raw-SQL tables that are missing from the Drizzle schema. Before pushing a schema change, inspect the proposed diff and preserve existing tables by modeling their current shape in Drizzle rather than accepting a drop or truncate.

**Why:** a development schema push attempted to delete the active `trc20_payments` table, which held payment records, until its existing schema was represented in Drizzle.

**How to apply:** Check live columns, types, defaults, nullability, constraints, indexes, and row counts when a push reports data loss. Choose only non-destructive changes after verifying current rows satisfy the new constraints.

## Drizzle push CLI options

With this workspace's Drizzle Kit, `push` rejects `--config` when any other CLI option is supplied. Use the database package's `push` script for the standard development schema sync; do not force-truncate tables to work around the CLI restriction.

**Why:** A filtered push attempt failed because the CLI does not accept `--config` alongside `--tablesFilter`; the package script successfully applied the additive schema changes.

**How to apply:** Prefer `pnpm --filter @workspace/db run push` for development changes. If a filtered push is essential, check the installed Drizzle Kit's supported config invocation first.

## Unique constraints during non-interactive pushes

Do not accept a suggested table truncation just because Drizzle prompts for it while adding a unique constraint. The prompt can appear for a populated table even when the values are already unique, and non-TTY pushes cannot answer it. Check for duplicate keys first; if none exist, preserve the rows and apply only the needed constraint change.

**Why:** a development push stopped on a truncate prompt for a two-row ballot table even though neither development nor production had duplicate ballot keys.

**How to apply:** Run an aggregate duplicate check in both environments before changing a unique constraint. Avoid `--force` or truncation unless the user explicitly approves data loss; after a safe, development-only constraint update, rerun the regular schema push and inspect the production diff.
