---
name: PK reassignment in PostgreSQL
description: How to change a primary key value when FK constraints reference it — the only reliable approach without deferrable constraints
---

## Rule

To change a PK value in PostgreSQL (e.g. citizens.id 3→1) when FK constraints exist:
1. `ALTER TABLE child DROP CONSTRAINT constraint_name` for every FK referencing the PK
2. `UPDATE parent SET id = NEW WHERE id = OLD`
3. `UPDATE child SET fk_col = NEW WHERE fk_col = OLD` for every child table
4. `ALTER TABLE child ADD CONSTRAINT constraint_name FOREIGN KEY (col) REFERENCES parent(id)` to restore
5. `SELECT setval('seq_name', (SELECT MAX(id) FROM parent))` to fix the sequence
— all inside one `BEGIN; ... COMMIT;` block in psql

**Why:** `SET session_replication_role = 'replica'` and `DISABLE TRIGGER ALL` do NOT bypass FK constraint checks in PostgreSQL — they only disable row-level triggers. The executeSql sandbox uses a separate connection per call, so session settings do NOT persist. The only reliable method is to DROP constraints, mutate, then re-ADD.

**How to apply:** Any time a PK needs renumbering (e.g. admin gets id=1). Run via `psql "$DATABASE_URL" << 'SQL' ... SQL` bash heredoc, not executeSql calls.
