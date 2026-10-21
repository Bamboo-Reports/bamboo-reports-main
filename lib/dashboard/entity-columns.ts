/**
 * Column projections shared by the paginated query endpoints, search
 * hydration, and lookup endpoints, so server-returned rows always have the
 * shape the client renders. Kept in a pure module (no server-only imports) so SQL
 * builders and tests can use them.
 */

export const ACCOUNT_COLUMNS = [
  "account_nasscom_status", "account_nasscom_member_status", "account_data_coverage", "account_source",
  "account_type", "account_global_legal_name", "account_hq_company_type",
  "account_about", "account_hq_key_offerings", "account_hq_city", "account_hq_state", "account_hq_country",
  "account_hq_region", "account_hq_sub_industry", "account_hq_industry", "account_hq_linkedin_link",
  "account_primary_category", "account_primary_nature", "account_hq_revenue_range", "account_hq_employee_count",
  "account_hq_employee_range", "account_hq_forbes_2000_rank", "account_hq_fortune_500_rank",
  "account_first_center_year", "account_primary_city", "account_hub_structure", "years_in_india",
  "account_hq_website", "account_center_employees",
  "account_center_employees_range", "account_visibility", "account_visibility_note",
]

export const CENTER_COLUMNS = [
  "account_global_legal_name", "cn_unique_key", "center_status", "center_inc_year", "announced_year",
  "announced_month", "center_end_year", "center_name", "center_management_partner", "center_jv_status",
  "center_jv_name", "center_type", "center_focus", "center_website", "center_linkedin", "center_city",
  "center_state", "center_country", "center_country_iso2", "center_employees", "center_employees_range",
  "center_boardline", "center_account_website", "center_timeline", "center_address",
  "center_micro_location", "center_zip_code",
  "lat", "lng",
]

export const PROSPECT_COLUMNS = [
  "ps_unique_key", "account_global_legal_name", "prospect_full_name", "prospect_first_name",
  "prospect_last_name", "prospect_title", "prospect_department", "prospect_level", "head_type",
  "prospect_linkedin_url", "prospect_email", "prospect_city", "prospect_state", "prospect_country",
  "prospect_in_company_year", "prospect_current_year", "center_name",
  "last_review_date", "email_verification_date", "contact_status", "prospect_engaged",
]

// Services and tech projections, used by the account and center detail lookups.
export const SERVICE_COLUMNS = [
  "cn_unique_key", "center_name", "primary_service", "focus_region", "service_it", "service_ai",
  "service_erd", "service_fna", "service_hr", "service_procurement", "service_sales_marketing",
  "service_customer_support", "service_others", "software_vendor", "software_in_use",
]

export const TECH_COLUMNS = [
  "account_global_legal_name", "cn_unique_key", "software_in_use", "software_vendor", "software_category",
]

/**
 * account_hq_revenue is a bigint; cast so it deserializes as a number.
 * account_hq_stock_ticker lives in the ticker table; the correlated subquery
 * keeps it on account rows for every unaliased "select ... from accounts".
 */
export const ACCOUNT_PROJECTION = [
  ...ACCOUNT_COLUMNS.filter((c) => c !== "account_hq_revenue"),
  "account_hq_revenue::float8 as account_hq_revenue",
  "(select t.account_hq_stock_ticker from ticker t where t.account_global_legal_name = accounts.account_global_legal_name) as account_hq_stock_ticker",
].join(", ")

// Tab sort keys -> server sort columns per entity (#249). The server ignores a
// column outside its whitelist (entity-query.ts resolveOrder) and falls back to
// the default order, so tests/unit/tab-sort-columns.test.ts checks each entry.
export const TAB_SORT_COLUMNS: Record<"accounts" | "centers" | "prospects", Record<string, string>> = {
  accounts: {
    name: "account_global_legal_name",
    industry: "account_hq_industry",
    revenue: "account_hq_revenue_range",
    employees: "account_center_employees_range",
  },
  centers: {
    name: "center_name",
    location: "center_city",
    type: "center_type",
    employees: "center_employees_range",
  },
  prospects: {
    name: "prospect_full_name",
    location: "prospect_city",
    title: "prospect_title",
    department: "prospect_department",
  },
}
