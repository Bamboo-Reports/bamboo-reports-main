# Schema Migration & Reference Guide (2026-02)

This guide documents the migration from the legacy column naming (uppercase, space-separated) to the new snake_case schema and provides a comprehensive reference for the current database structure (`etl/master-schema.json`).

> Target Audience: Backend engineers, Data engineers, and Frontend developers wiring up UI components.
> Source of Truth: The database schema definitions below are derived from the master schema JSON.

---

## 1. Quick Summary

- Core Tables: `accounts`, `centers`, `services`, `functions`, `tech`, `prospects`.
- Audit Tables: `audit.import_runs`, `audit.field_change_events`, `audit.notification_reads`.
- Naming Convention: strict `snake_case`.
- Primary Keys (PK):
  - `accounts` -> `account_global_legal_name`
  - `centers` -> `cn_unique_key`
- Linkage:
  - `centers` links to `accounts` via `account_global_legal_name`.
  - `services`, `functions`, and `tech` link to `centers` via `cn_unique_key`.
  - `tech` and `prospects` also link to `accounts` via `account_global_legal_name`.

---

## 2. Detailed Schema Reference

### 2.1 Table: `accounts`
Description: Top-level company entity with HQ details, global metrics, and aggregate India presence fields.

Notable columns:
- Keys and metadata: `account_global_legal_name` (PK), `uuid`, `account_last_update_date`, `account_hq_stock_ticker`
- Classification: `account_nasscom_status`, `account_nasscom_member_status`, `account_data_coverage`, `account_source`, `account_type`
- HQ profile: `account_hq_address`, `account_hq_city`, `account_hq_state`, `account_hq_zip_code`, `account_hq_country`, `account_hq_region`, `account_hq_boardline`, `account_hq_website`, `account_hq_linkedin_link`
- Industry and positioning: `account_hq_sub_industry`, `account_hq_industry`, `account_primary_category`, `account_primary_nature`
- Financials: `account_hq_revenue`, `account_hq_revenue_range`, `account_hq_fy_end`, `account_hq_revenue_year`, `account_hq_revenue_source_type`, `account_hq_revenue_source_link`
- Workforce: `account_hq_employee_count`, `account_hq_employee_range`, `account_hq_employee_source_type`, `account_hq_employee_source_link`, `account_center_employees`, `account_center_employees_range`
- India timeline: `account_first_center_year`, `years_in_india`
- Notes and coverage: `account_comments`, `account_coverage`

### 2.2 Table: `centers`
Description: Delivery centers or office locations.

Notable columns:
- Keys and metadata: `cn_unique_key` (PK), `uuid`, `last_update_date`
- Linkage: `account_global_legal_name`
- Timeline: `center_inc_year`, `announced_year`, `announced_month`, `center_end_year`, `center_first_year`, `center_timeline`
- Identity and profile: `center_name`, `center_status`, `center_type`, `center_focus`, `center_management_partner`, `center_jv_status`, `center_jv_name`
- Location: `center_address`, `center_city`, `center_state`, `center_zip_code`, `center_country`, `center_country_iso2`, `center_region`, `lat`, `lng`
- Contact and source fields: `center_boardline`, `center_account_website`, `center_website`, `center_linkedin`, `center_source_link`, `center_inc_year_notes`, `center_inc_year_updated_link`
- Capacity and notes: `center_employees`, `center_employees_range`, `center_employees_range_source_link`, `center_services`, `center_comments`
- Segment fields: `center_business_segment`, `center_business_sub_segment`

### 2.3 Table: `services`
Description: Service-line rows linked to centers.

Notable columns:
- Keys and metadata: `uuid`, `last_update_date`
- Linkage: `cn_unique_key`, `account_global_legal_name`
- Denormalized center fields: `center_name`, `center_type`, `center_focus`, `center_city`
- Service taxonomy: `primary_service`, `focus_region`, `service_it`, `service_erd`, `service_fna`, `service_hr`, `service_procurement`, `service_sales_marketing`, `service_customer_support`, `service_others`
- Tech fields: `software_vendor`, `software_in_use`

### 2.4 Table: `functions`
Description: Function rows linked to centers.

Columns:
- `uuid`
- `cn_unique_key`
- `function_name`

### 2.5 Table: `tech`
Description: Technology stack rows linked to centers/accounts. Used for software keyword filtering and tech visualizations.

Columns:
- `uuid`
- `account_global_legal_name`
- `cn_unique_key`
- `software_in_use`
- `software_vendor`
- `software_category`

### 2.6 Table: `prospects`
Description: Contact/lead rows linked to accounts.

Columns:
- `uuid`
- `last_update_date`
- `ps_unique_key`
- `account_global_legal_name`
- `center_name`
- `prospect_full_name`, `prospect_first_name`, `prospect_last_name`
- `prospect_title`, `prospect_in_company_year`, `prospect_current_year`
- `prospect_department`, `prospect_level`, `head_type`
- `prospect_linkedin_url`, `prospect_other_source_url`, `prospect_email`
- `prospect_city`, `prospect_state`, `prospect_country`

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

---

## 4. Developer Notes for Maintainers

### 4.1 Data Fetching (`app/actions/data.ts`)
- Queries use `snake_case` column names.
- When adding a new filter, update both query and in-memory filtering paths.

### 4.2 Type Definitions (`lib/types.ts`)
- Keep interfaces aligned with `master-schema.json`.
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
- CI/CD: Vercel uses `pnpm install --no-frozen-lockfile` to handle potential lockfile mismatches.
