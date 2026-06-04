# Table Relationships Reference

> **Scope:** How the core data tables are interlinked — from the ETL foreign-key constraints all the way through the dashboard's DB queries and client-side filtering logic.

---

## Table Hierarchy

```
accounts  (PK: account_global_legal_name)
  ├──[account_global_legal_name]──► alias
  ├──[account_global_legal_name]──► centers  (PK: cn_unique_key)
  │                                    ├──[cn_unique_key]──► services
  │                                    ├──[cn_unique_key]──► functions
  │                                    └──[cn_unique_key]──► tech
  └──[account_global_legal_name]──► prospects
```

**Two hub keys govern all relationships:**

| Key | Lives in | Referenced by |
|-----|----------|---------------|
| `account_global_legal_name` | `accounts` (PK) | `alias`, `centers`, `prospects` |
| `cn_unique_key` | `centers` (PK) | `services`, `functions`, `tech` |

---

## Core Tables

| Table | Description | Primary Key |
|-------|-------------|-------------|
| `accounts` | Top-level company entities with HQ details, financials, workforce | `account_global_legal_name` |
| `alias` | Alternate account names (brand, abbreviation, flagship products) | `account_global_legal_name` |
| `centers` | Delivery centers / office locations with geospatial data | `cn_unique_key` |
| `services` | Service-line rows linked to centers | `cn_unique_key` (composite) |
| `functions` | Business function rows linked to centers | *(no surrogate PK)* |
| `tech` | Technology stack rows (software, vendors, categories) | `cn_unique_key` (composite) |
| `prospects` | Contact/lead rows linked to accounts | `ps_unique_key` |

---

## ETL Foreign Key Constraints

Defined in `etl/main.py` → `CONSTRAINTS_SQL`. All child tables cascade on parent delete.

| Child Table | Parent Table | Linking Column | Behaviour |
|-------------|--------------|----------------|-----------|
| `alias` | `accounts` | `account_global_legal_name` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `centers` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |
| `services` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `functions` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `tech` | `centers` | `cn_unique_key` | `ON DELETE CASCADE` |
| `prospects` | `accounts` | `account_global_legal_name` | `ON DELETE CASCADE` |

> **Cascade rule:** Deleting a company (`accounts`) automatically deletes its aliases, centers, and prospects. Deleting a center automatically deletes its services, functions, and tech rows.

---

## ETL Import Order

Tables are imported in dependency order so parent records always exist before child records are written:

```
accounts → alias → centers → services → functions → tech → prospects
```

---

## Dashboard Linking — Verified Consistent ✅

The dashboard honours the same linking columns at every layer. No discrepancies found.

### DB-Level Queries (`app/actions/data.ts`, `lib/exports/server-builder.ts`)

| Join | Column | Source |
|------|--------|--------|
| `centers` → `accounts` | `account_global_legal_name` | Summary metrics SQL — `LEFT JOIN accounts a ON a.account_global_legal_name = c.account_global_legal_name` |
| `prospects` → `accounts` | `account_global_legal_name` | Summary metrics SQL — `LEFT JOIN accounts a ON a.account_global_legal_name = p.account_global_legal_name` |
| Services export filter | `cn_unique_key` | `WHERE cn_unique_key = ANY(${centerKeys})` |
| Prospects export filter | `account_global_legal_name` | `WHERE account_global_legal_name = ANY(${names})` |

### Client-Side Filtering (`lib/dashboard/filtering.ts`)

Data is fetched flat (no DB-level joins for the main dashboard payload) and linked in-memory using Sets:

| Filter logic | Linking column |
|--------------|----------------|
| Centers filtered by account | `center.account_global_legal_name` matched against `accountNameSet` |
| Prospects filtered by account | `prospect.account_global_legal_name` matched against `accountNameSet` |
| Functions filtered by center | `func.cn_unique_key` matched against `centerKeySet` |
| Services filtered by center | `service.cn_unique_key` matched against `centerKeySet` |
| Tech (software index) keyed by center | `techRow.cn_unique_key` used to build `centerSoftwareIndex` |

### Prisma Schema (`prisma/schema.prisma`)

Only `AccountWarehouse` (`accounts`) and `CenterWarehouse` (`centers`) are modelled as Prisma models. The remaining tables (`services`, `functions`, `tech`, `prospects`, `alias`) are queried via raw SQL (`$queryRaw`). Prisma does not define `@relation` fields between them — joins and linking happen in query logic and client-side filters instead, which is appropriate for a read-only BI warehouse.

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
| `etl/main.py` | Single source of truth for `CONSTRAINTS_SQL`, `TABLE_DEFS`, and `IMPORT_ORDER` |
| `prisma/schema.prisma` | Prisma models for `accounts` and `centers` |
| `app/actions/data.ts` | Server-side data fetching with DB-level joins |
| `lib/dashboard/filtering.ts` | Client-side in-memory linking and filter propagation |
| `lib/exports/server-builder.ts` | Export queries filtered by `account_global_legal_name` / `cn_unique_key` |
| `documentation/schema-migration-guide.md` | Full column definitions and migration history |
