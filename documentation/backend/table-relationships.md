# Table Relationships Reference

> **Scope:** How the core data tables are interlinked, from the ETL foreign-key constraints through the dashboard's server-side SQL.

---

## Table Hierarchy

```
accounts  (PK: account_global_legal_name)
  ├──[account_global_legal_name]──► ticker  (PK: account_global_legal_name)
  ├──[account_global_legal_name]──► alias
  ├──[account_global_legal_name]──► centers  (PK: cn_unique_key)
  │                                    ├──[cn_unique_key]──► services
  │                                    ├──[cn_unique_key]──► functions
  │                                    └──[cn_unique_key]──► tech
  └──[account_global_legal_name]──► prospects
                                       └──[lower(prospect_email)]──► subscribers  (logical link, no FK)
```

**Two hub keys govern all relationships:**

| Key | Lives in | Referenced by |
|-----|----------|---------------|
| `account_global_legal_name` | `accounts` (PK) | `ticker`, `alias`, `centers`, `prospects` |
| `cn_unique_key` | `centers` (PK) | `services`, `functions`, `tech` |

---

## Core Tables

Only `accounts`, `ticker`, and `centers` currently have database primary-key constraints in `etl/importer/tables.py`.
The remaining child tables are linked through the hub keys below, but their ETL/logical identifiers are
not database-enforced primary keys and should not be modelled as Prisma `@id` fields.

| Table | Description | Database primary key | ETL/logical identity or link |
|-------|-------------|----------------------|------------------------------|
| `accounts` | Top-level company entities with HQ details, financials, workforce | `account_global_legal_name` | `account_global_legal_name` |
| `ticker` | Stock ticker per account (one row per account) | `account_global_legal_name` | `account_global_legal_name` |
| `alias` | Alternate account names (brand, abbreviation, flagship products) | *(none)* | `account_global_legal_name` |
| `centers` | Delivery centers / office locations with geospatial data | `cn_unique_key` | `cn_unique_key` |
| `services` | Service-line rows linked to centers | *(none)* | `cn_unique_key` |
| `functions` | Business function rows linked to centers | *(none)* | `cn_unique_key`, `function_name` |
| `tech` | Technology stack rows (software, vendors, categories) | *(none)* | `cn_unique_key` plus software fields |
| `prospects` | Contact/lead rows linked to accounts | *(none)* | `ps_unique_key` |
| `subscribers` | Campaign engagement rows (one per prospect per campaign), linked to prospects | *(none)* | `lower(prospect_email)` |

---

## ETL Foreign Key Constraints

Defined in `etl/importer/tables.py` → `CONSTRAINTS_SQL`. All child tables cascade on parent delete.

| Child Table | Parent Table | Linking Column | Behaviour |
|-------------|--------------|----------------|-----------|
| `ticker` | `accounts` | `account_global_legal_name` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `alias` | `accounts` | `account_global_legal_name` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `centers` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |
| `services` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `functions` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `tech` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `prospects` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |

> **Cascade rule:** Deleting a company (`accounts`) automatically deletes its aliases, centers, and prospects. Deleting a center automatically deletes its services, functions, and tech rows.

> **`subscribers` has no FK.** It links to `prospects` by email, but `prospects.prospect_email` is not unique (the same email can appear on more than one prospect row) and some emails differ only by case, so a constraint is not possible. Join with `lower(s.prospect_email) = lower(p.prospect_email)`; both sides have a `lower(prospect_email)` expression index. A subscriber whose email is on several prospect rows matches all of them.

---

## ETL Import Order

`IMPORT_ORDER` in `etl/importer/tables.py` lists the tables in dependency order:

```
accounts → ticker → alias → centers → services → functions → tech → prospects → subscribers
```

The loader (`etl/importer/load.py`) does not rely on that order for integrity, though: it writes every table concurrently with a `ThreadPoolExecutor` (each table is dropped with `CASCADE` and recreated), and only after all tables have loaded does it run `apply_constraints` (`etl/importer/database.py`), which adds the primary keys and foreign keys from `CONSTRAINTS_SQL`, followed by indexes and `ANALYZE`. The order is used for selecting tables and for display.

---

## Dashboard Linking

The dashboard honours the same linking columns at every layer.

### DB-Level Queries (`lib/dashboard/filtering-sql.ts`, `lib/dashboard/account-related.ts`, `lib/exports/server-builder.ts`)

The filter SQL does not join tables; it links them with `IN (SELECT ...)` membership against CTEs (`acc0`, `func_centers`, `prospect_accounts`, `surviving_centers`, `final_accounts`) built in `buildWith`.

| Link | Column | Source |
|------|--------|--------|
| `centers` → `accounts` | `account_global_legal_name` | `filtering-sql.ts`: `account_global_legal_name in (select account_global_legal_name from acc0)` |
| `centers` → `functions` | `cn_unique_key` | `filtering-sql.ts`: `cn_unique_key in (select cn_unique_key from func_centers)` |
| `centers` → `tech` (software filter) | `cn_unique_key` | `filtering-sql.ts`: `cn_unique_key in (select cn_unique_key from tech where ...)` |
| `prospects` → `accounts` | `account_global_legal_name` | `filtering-sql.ts`: `prospect_accounts` CTE matched on `account_global_legal_name` |
| Account detail services | `cn_unique_key` | `account-related.ts`: `where cn_unique_key in (select cn_unique_key from centers where account_global_legal_name = $1)` |
| Services export filter | `cn_unique_key` | `server-builder.ts`: `WHERE cn_unique_key = ANY(${centerKeys})` |
| Prospects export filter | `account_global_legal_name` | `server-builder.ts`: `WHERE account_global_legal_name = ANY(${names})` |

### In-Memory Reference (`lib/dashboard/filtering.ts`)

Client-side filtering was retired with the full-payload dashboard route on 2026-09-05 (#249). `lib/dashboard/filtering.ts` is kept as the reference implementation that the SQL parity tests (`tests/unit/filtering-sql-*.test.ts`, `tests/integration/filtering-sql-*.test.ts`) compare `filtering-sql.ts` against; at runtime the dashboard passes it empty arrays. It links rows in memory with Sets on the same columns:

| Filter logic | Linking column |
|--------------|----------------|
| Centers filtered by account | `center.account_global_legal_name` matched against `accountNameSet` |
| Prospects filtered by account | `prospect.account_global_legal_name` matched against `accountNameSet` |
| Functions filtered by center | `func.cn_unique_key` matched against `centerKeySet` |
| Services filtered by center | `service.cn_unique_key` matched against `centerKeySet` |
| Tech (software index) keyed by center | `techRow.cn_unique_key` used to build `centerSoftwareIndex` |

### Prisma Schema (`prisma/schema.prisma`)

Only `AccountWarehouse` (`accounts`) and `CenterWarehouse` (`centers`) are modelled as Prisma models. The remaining tables (`services`, `functions`, `tech`, `prospects`, `alias`, `ticker`, `subscribers`) are queried via raw SQL (`$queryRaw` or the parameterized statements run by `lib/db/warehouse.ts`). Prisma does not define `@relation` fields between them; linking happens in the SQL query logic instead, which is appropriate for a read-only BI warehouse.

---

## Audit Schema Tables (`audit.*`)

| Table | Description | Links to |
|-------|-------------|----------|
| `audit.import_runs` | Log of every ETL run | none |
| `audit.field_change_events` | Field-level change log per record | `import_runs` via `import_run_id` |
| `audit.notification_reads` | Legacy per-event read log. The ETL (`etl/importer/changes.py`) still creates it and folds it into `user_notification_state`, but the app no longer reads or writes it | `field_change_events` via `change_event_id` |
| `audit.user_notification_state` | Per-user bookmark of last-read timestamp (`user_id`, `last_read_at`), read and written by `app/actions/notifications.ts` | none |

---

## Related Files

| File | Purpose |
|------|---------|
| `etl/importer/tables.py` | Single source of truth for `CONSTRAINTS_SQL`, `TABLE_DEFS`, and `IMPORT_ORDER` |
| `prisma/schema.prisma` | Prisma models for `accounts` and `centers` |
| `etl/importer/load.py` | Concurrent table load, then constraints, indexes and `ANALYZE` |
| `lib/dashboard/filtering-sql.ts` | Server-side filter cascade as SQL membership CTEs (accounts, centers, functions, tech, prospects) |
| `lib/dashboard/filtering.ts` | In-memory reference implementation used by the SQL parity tests |
| `lib/exports/server-builder.ts` | Export queries filtered by `account_global_legal_name` / `cn_unique_key` |
| `documentation/backend/schema-migration-guide.md` | Full column definitions and migration history |
