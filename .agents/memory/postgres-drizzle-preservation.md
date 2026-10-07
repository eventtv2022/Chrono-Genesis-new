---
name: Drizzle schema preservation
description: Protect active tables that are used through raw SQL when synchronizing the Drizzle schema.
---

The development PostgreSQL database can contain active raw-SQL tables that are missing from the Drizzle schema. Before pushing a schema change, inspect the proposed diff and preserve existing tables by modeling their current shape in Drizzle rather than accepting a drop or truncate.

**Why:** a development schema push attempted to delete the active `trc20_payments` table, which held payment records, until its existing schema was represented in Drizzle.

**How to apply:** Check live columns, types, defaults, nullability, constraints, indexes, and row counts when a push reports data loss. Choose only non-destructive changes after verifying current rows satisfy the new constraints.
