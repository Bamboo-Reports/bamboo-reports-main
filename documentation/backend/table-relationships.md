# Table Relationships Reference

> **Scope:** How the core data tables are interlinked — from the ETL foreign-key constraints all the way through the dashboard's DB queries and client-side filtering logic.

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
| `account_global_legal_name` | `accounts` (PK) | `ticker`, `alias`, `centers`, `prospects`, `tech` (denormalized, no FK) |
| `cn_unique_key` | `centers` (PK) | `services`, `functions`, `tech` |

`subscribers` hangs off `prospects` by `lower(prospect_email)`, outside the two hub keys (see below).

---

## Core Tables

Only `accounts`, `ticker`, and `centers` currently have database primary-key constraints in `etl/V2/main_cache_purge.py` (and its backup `etl/V2/main.py`).
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

Defined in `etl/V2/main_cache_purge.py` (mirrored in `etl/V2/main.py`) → `CONSTRAINTS_SQL`. All child tables cascade on parent delete.

| Child Table | Parent Table | Linking Column | Behaviour |
|-------------|--------------|----------------|-----------|
| `ticker` | `accounts` | `account_global_legal_name` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `alias` | `accounts` | `account_global_legal_name` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `centers` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |
| `services` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `functions` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `tech` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `prospects` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |

> **Cascade rule:** Deleting a company (`accounts`) automatically deletes its ticker, aliases, centers, and prospects. Deleting a center automatically deletes its services, functions, and tech rows.

> **`subscribers` has no FK.** It links to `prospects` by email, but `prospects.prospect_email` is not unique (the same email can appear on more than one prospect row) and some emails differ only by case, so a constraint is not possible. Join with `lower(s.prospect_email) = lower(p.prospect_email)`; both sides have a `lower(prospect_email)` expression index. A subscriber whose email is on several prospect rows matches all of them.

---

## ETL Import Order

Tables are imported in dependency order so parent records always exist before child records are written:

```
accounts → ticker → alias → centers → services → functions → tech → prospects → subscribers
```

---

## Dashboard Linking — Verified Consistent ✅

The dashboard honours the same linking columns at every layer. No discrepancies found.

### DB-Level Queries (`lib/dashboard/filtering-sql.ts`, `lib/dashboard/account-related.ts`, `lib/exports/server-builder.ts`, `app/api/prospects/[id]/engagements/route.ts`)

The filter cascade in `filtering-sql.ts` builds CTEs (`acc0`, `func_centers`, `prospect_accounts`, `surviving_centers`, `final_accounts`) and links them with set membership (`col in (select col from cte)`) rather than joins:

| Link | Column | Source |
|------|--------|--------|
| `centers` ↔ `accounts` | `account_global_legal_name` | `surviving_centers` keeps centers whose account is in `acc0`; `final_accounts` keeps accounts with a surviving center |
| `prospects` → `accounts` | `account_global_legal_name` | `prospect_accounts` CTE (distinct accounts with a matching prospect) |
| `functions` → `centers` | `cn_unique_key` | `func_centers` CTE (Services Offered filter) |
| `tech` → `centers` | `cn_unique_key` | `cn_unique_key in (select cn_unique_key from tech where ...)` (Software In Use filter) |
| Account dialog related rows | `account_global_legal_name`, `cn_unique_key` | `account-related.ts`: centers, tech and prospects by account name; services by `cn_unique_key in (select cn_unique_key from centers where account_global_legal_name = $1)` |
| Services export | `cn_unique_key` | `WHERE cn_unique_key = ANY(${centerKeys})`, or `cn_unique_key in (<filtered centers query>)` |
| Prospects export | `ps_unique_key` / `account_global_legal_name` | `WHERE ps_unique_key = ANY(${keys})` for a row selection, `WHERE account_global_legal_name = ANY(${names})` for an account selection |
| Prospect activity timeline | `lower(prospect_email)` | `select ... from subscribers where lower(prospect_email) = (select lower(prospect_email) from prospects where ps_unique_key = $1 limit 1)` |

### Reference Engine (`lib/dashboard/filtering.ts`)

The dashboard is server-backed (the full-payload route was retired in `43e95a7`). `getFilteredData` in `lib/dashboard/filtering.ts` is kept as the in-memory reference engine that the SQL parity tests compare against (`documentation/backend/filtering-sql-parity-report.md`). It links flat arrays in memory using Sets:

| Filter logic | Linking column |
|--------------|----------------|
| Centers filtered by account | `center.account_global_legal_name` matched against `accountNameSet` |
| Prospects filtered by account | `prospect.account_global_legal_name` matched against `accountNameSet` |
| Functions filtered by center | `func.cn_unique_key` matched against `centerKeySet` |
| Services filtered by center | `service.cn_unique_key` matched against `centerKeySet` |
| Tech (software index) keyed by center | `techRow.cn_unique_key` used to build `centerSoftwareIndex` |

### Prisma Schema (`prisma/schema.prisma`)

Only `AccountWarehouse` (`accounts`) and `CenterWarehouse` (`centers`) are modelled as Prisma models. The remaining tables (`services`, `functions`, `tech`, `prospects`, `alias`, `ticker`, `subscribers`) are queried via raw SQL (`$queryRaw` or `queryWarehouse` in `lib/db/warehouse.ts`). Prisma does not define `@relation` fields between them: joins and linking happen in query logic instead, which is appropriate for a read-only BI warehouse.

---

## Audit Schema Tables (`audit.*`)

| Table | Description | Links to |
|-------|-------------|----------|
| `audit.import_runs` | Log of every ETL run | — |
| `audit.field_change_events` | Field-level change log per record | `import_runs` via `import_run_id` |
| `audit.notification_reads` | Which users have read which change events | `field_change_events` via `change_event_id` |
| `audit.user_notification_state` | Per-user bookmark of last-read timestamp | — |

---

## Related Files

| File | Purpose |
|------|---------|
| `etl/V2/main_cache_purge.py` | ETL entry point (via `run.sh`); defines `CONSTRAINTS_SQL`, `TABLE_DEFS`, and `IMPORT_ORDER`, kept in sync with `etl/V2/main.py` |
| `prisma/schema.prisma` | Prisma models for `accounts` and `centers` |
| `lib/dashboard/filtering-sql.ts` | Server-side filter cascade as CTEs (accounts, centers, functions, tech, prospects) |
| `lib/dashboard/filtering.ts` | In-memory reference engine for the SQL parity tests |
| `lib/dashboard/account-related.ts` | Account dialog related rows (centers, services, tech, prospects) |
| `lib/exports/server-builder.ts` | Export queries filtered by `account_global_legal_name` / `cn_unique_key` / `ps_unique_key` |
| `app/api/prospects/[id]/engagements/route.ts` | Prospect to subscribers lookup by `lower(prospect_email)` |
| `documentation/backend/schema-migration-guide.md` | Full column definitions and migration history |
