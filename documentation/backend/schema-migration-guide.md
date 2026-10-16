# Schema Migration & Reference Guide (2026-05)

This guide documents the migration from the legacy column naming (uppercase, space-separated) to the new snake_case schema and provides a comprehensive reference for the current database columns (`etl/V2/master-schema.json`). For table hierarchy, primary keys, and linking columns, use `documentation/backend/table-relationships.md` as the source of truth.

> Target Audience: Backend engineers, Data engineers, and Frontend developers wiring up UI components.
> Source of Truth: Column definitions below are derived from the master schema JSON. Relationship and key semantics are defined in `documentation/backend/table-relationships.md`.

---

## 1. Quick Summary

- Core Tables: `accounts`, `ticker`, `alias`, `centers`, `services`, `functions`, `tech`, `prospects`, `subscribers`.
- Audit Tables: `audit.import_runs`, `audit.field_change_events`, `audit.notification_reads`, `audit.user_notification_state`.
- Naming Convention: strict `snake_case`.
- Primary keys and table relationships: see `documentation/backend/table-relationships.md`.
- Linkage:
  - `centers` links to `accounts` via `account_global_legal_name`.
  - `services`, `functions`, and `tech` link to `centers` via `cn_unique_key`.
  - `tech`, `prospects`, `alias`, and `ticker` also link to `accounts` via `account_global_legal_name`.
  - `subscribers` links to `prospects` via `lower(prospect_email)` (logical link, no foreign key).

---

## 2. Detailed Schema Reference

### 2.1 Table: `accounts`
Description: Top-level company entity with HQ details, global metrics, and aggregate India presence fields.

Notable columns:
- Keys and metadata: `account_global_legal_name` (PK), `uuid`, `account_last_update_date`
- Classification: `account_nasscom_status`, `account_nasscom_member_status`, `account_data_coverage`, `account_source`, `account_type`, `account_hq_company_type`
- Profile: `account_about`, `account_hq_key_offerings`, `account_key_offerings_source_link`
- HQ profile: `account_hq_address`, `account_hq_city`, `account_hq_state`, `account_hq_zip_code`, `account_hq_country`, `account_hq_region`, `account_hq_boardline`, `account_hq_website`, `account_hq_linkedin_link`
- Industry and positioning: `account_hq_sub_industry`, `account_hq_industry`, `account_primary_category`, `account_primary_nature`
- Rankings: `account_hq_forbes_2000_rank`, `account_hq_fortune_500_rank` (`INTEGER`)
- Financials: `account_hq_revenue`, `account_hq_revenue_range`, `account_hq_fy_end`, `account_hq_revenue_year`, `account_hq_revenue_source_type`, `account_hq_revenue_source_link`
- Workforce: `account_hq_employee_count`, `account_hq_employee_range`, `account_hq_employee_source_type`, `account_hq_employee_source_link`, `account_center_employees`, `account_center_employees_range`
- India timeline and presence: `account_first_center_year`, `years_in_india`, `account_primary_city`, `account_hub_structure`
- Notes: `account_comments`
- Visibility: `account_visibility` (`include` / `exclude`, default `include`), `account_visibility_note` (human-readable exclusion reason)

### 2.2 Table: `centers`
Description: Delivery centers or office locations.

Notable columns:
- Keys and metadata: `cn_unique_key` (PK), `uuid`, `last_update_date`
- Linkage: `account_global_legal_name`
- Timeline: `center_inc_year`, `announced_year`, `announced_month`, `center_end_year`, `center_first_year`, `center_timeline`
- Identity and profile: `center_name`, `center_status`, `center_type`, `center_focus`, `center_management_partner`, `center_jv_status`, `center_jv_name`
- Location: `center_address`, `center_micro_location`, `center_city`, `center_state`, `center_zip_code`, `center_country`, `center_country_iso2`, `lat`, `lng`
- Contact and source fields: `center_boardline`, `center_account_website`, `center_website`, `center_linkedin`, `center_source_link`, `center_inc_year_notes`, `center_inc_year_updated_link`
- Capacity and notes: `center_employees`, `center_employees_range`, `center_employees_comment`, `center_services`, `center_comments`
- Headcount sources: `center_employees_article`, `center_employees_article_source_link`, `center_employees_linkedin`, `center_employees_range_linkedin_source_link`

### 2.3 Table: `services`
Description: Service-line rows linked to centers.

Notable columns:
- Keys and metadata: `cn_unique_key` (service row identity, see `documentation/backend/table-relationships.md`), `uuid`, `last_update_date`
- Linkage: `cn_unique_key`, `account_global_legal_name`
- Denormalized center fields: `center_name`, `center_type`, `center_focus`, `center_city`
- Service taxonomy: `primary_service`, `focus_region`, `service_it`, `service_ai`, `service_erd`, `service_fna`, `service_hr`, `service_procurement`, `service_sales_marketing`, `service_customer_support`, `service_others`
- Source links (one per taxonomy column, added 2026-09-22 with `service_ai`): `primary_service_link`, `focus_region_link`, `service_it_link`, `service_ai_link`, `service_erd_link`, `service_fna_link`, `service_hr_link`, `service_procurement_link`, `service_sales_marketing_link`, `service_customer_support_link`, `service_others_link`
- Tech fields: `software_vendor`, `software_in_use`, `software_source_link`
- Notes: `service_comments`

The dashboard reads the taxonomy and software columns (`SERVICE_COLUMNS` in `lib/dashboard/entity-columns.ts`); the `*_link` columns and `service_comments` are typed on `Service` in `lib/types.ts` but not shown in the UI yet. The Excel export includes every column (`select *`).

### 2.4 Table: `functions`
Description: Function rows linked to centers.

Columns:
- `uuid`
- `cn_unique_key`
- `function_name`

Relationship identity: no surrogate primary key; rows link to centers via `cn_unique_key` and are interpreted with `function_name`.

### 2.5 Table: `tech`
Description: Technology stack rows linked to centers/accounts. Used for software keyword filtering and tech visualizations.

Columns:
- `uuid`
- `account_global_legal_name`
- `cn_unique_key`
- `software_in_use`
- `software_vendor`
- `software_category`

Relationship identity: linked to centers by `cn_unique_key`; see `documentation/backend/table-relationships.md` for the composite relationship semantics.

### 2.6 Table: `prospects`
Description: Contact/lead rows linked to accounts.

Columns:
- `uuid`
- `last_update_date`
- `last_review_date`, `email_verification_date`, `contact_status` (internal review metadata, not shown in the UI)
- `ps_unique_key` (prospect row identity, see `documentation/backend/table-relationships.md`)
- `account_global_legal_name`
- `center_name`
- `prospect_full_name`, `prospect_first_name`, `prospect_last_name`
- `prospect_title`, `prospect_in_company_year`, `prospect_current_year`
- `prospect_department`, `prospect_level`, `head_type`
- `prospect_linkedin_url`, `prospect_other_source_url`, `prospect_email`
- `prospect_phone` (10 digits, checked by the sheet validator; not shown in the UI)
- `prospect_engaged` (`Yes` when the prospect's email has at least one `subscribers` row; drives the Engaged filter and badge)
- `prospect_city`, `prospect_state`, `prospect_country`

### 2.7 Table: `alias`
Description: Alternate names and brands for an account, sourced from the "alias" sheet. Powers alias-aware account search (global search and the account filter autocomplete). Linked to `accounts` by a foreign key on `account_global_legal_name` with `ON UPDATE CASCADE` / `ON DELETE CASCADE`.

Columns:
- `uuid`
- `account_global_legal_name` (alias row identity and FK to `accounts`, see `documentation/backend/table-relationships.md`)
- `short_legal_name`
- `brand_name`
- `abbreviated_name`
- `flagship_products`
- `currently_known_as`
- `notes`

### 2.8 Table: `ticker`
Description: Stock ticker per account, sourced from the "ticker" sheet (one row per account). The server merges `account_hq_stock_ticker` onto each account object for the dashboard, so UI code keeps reading it from the account. Linked to `accounts` by a foreign key on `account_global_legal_name` with `ON UPDATE CASCADE` / `ON DELETE CASCADE`.

Columns:
- `uuid`
- `account_global_legal_name` (PK and FK to `accounts`)
- `account_hq_stock_ticker`
- `notes`

### 2.9 Table: `subscribers`
Description: Campaign engagement rows, sourced from the "subscribers" sheet: one row per prospect per campaign touchpoint, so `uuid` repeats and there is no primary key. Powers the campaign activity timeline in the prospect dialog (`app/api/prospects/[id]/engagements/route.ts`). Not a filterable entity; the Engaged filter reads `prospects.prospect_engaged`.

Columns:
- `uuid`
- `prospect_engaged_date` (text, for example `8-September-2026`; parsed by `parseEngagedDate` in `lib/dashboard/engagements.ts`)
- `prospect_email` (logical link to `prospects.prospect_email`, case-insensitive; no foreign key)
- `prospect_engaged_campaign`

> Relationship reference: `documentation/backend/table-relationships.md`.

---

## 3. Linkage & Cascade Logic

1. Centers are the anchor.
- `cn_unique_key` is the pivot for `services`, `functions`, and `tech`.

2. Top-level accounts.
- `accounts` can be filtered directly by account fields or indirectly via matching child center/tech/prospect rows.

3. Cascades.
- Account <-> Center: bi-directional in dashboard filtering.
- Center <-> Function: bi-directional in dashboard filtering.
- Center <-> Tech: software filters map through `tech.cn_unique_key`.
- Prospects: linked primarily by `account_global_legal_name`.
- Subscribers: linked to prospects by `lower(prospect_email)`; read per prospect for the activity timeline, never part of the filter cascade.
- Alias: linked to accounts by `account_global_legal_name`; alias rows feed account search but are not a filterable entity.

---

## 4. Developer Notes for Maintainers

### 4.1 Data Fetching (`lib/dashboard/filtering-sql.ts`)
- Queries use `snake_case` column names.
- When adding a new filter, update the `Filters` type (`lib/types.ts`), defaults (`lib/dashboard/defaults.ts`), the sidebar config (`lib/config/filters.ts`), analytics metadata (`lib/analytics/filter-metadata.ts`), the SQL path (`lib/dashboard/filtering-sql.ts`), and the reference engine used by the parity tests (`lib/dashboard/filtering.ts`).

### 4.2 Type Definitions (`lib/types.ts`)
- Keep interfaces aligned with `etl/V2/master-schema.json`.
- Numeric DB fields (`INTEGER`, `BIGINT`, `DOUBLE PRECISION`) should be typed as `number | null` where nullable.
- `TIMESTAMP` fields are represented as `string | null` in current frontend types.

### 4.3 UI Components
- Maps (`components/maps/*`) require `lat` and `lng`.
- Tech visuals and software keyword filters depend on `tech.software_in_use`, `tech.software_vendor`, and `tech.software_category`.

### 4.4 Common Pitfalls
- Range fields (for example `*_range`) are buckets, not exact numeric values.
- Denormalized fields in `services` may lag if upstream ETL sync is partial.
- Saved filter JSON may need compatibility handling if filter keys are renamed.

---

## 5. Deployment & Tools
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm test` (Vitest)
- Package manager: npm (`package-lock.json`).
