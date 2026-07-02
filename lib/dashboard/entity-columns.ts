/**
 * Column projections shared by the paginated query endpoints, search
 * hydration, and lookup endpoints. They mirror the dashboard fetchers in
 * app/actions/data.ts so server-returned rows have the same shape the client
 * already renders. Kept in a pure module (no server-only imports) so SQL
 * builders and tests can use them.
 */

export const ACCOUNT_COLUMNS = [
  "account_nasscom_status", "account_nasscom_member_status", "account_data_coverage", "account_source",
  "account_type", "account_global_legal_name", "account_hq_stock_ticker", "account_hq_company_type",
  "account_about", "account_hq_key_offerings", "account_hq_city", "account_hq_state", "account_hq_country",
  "account_hq_region", "account_hq_sub_industry", "account_hq_industry", "account_hq_linkedin_link",
  "account_primary_category", "account_primary_nature", "account_hq_revenue_range", "account_hq_employee_count",
  "account_hq_employee_range", "account_hq_forbes_2000_rank", "account_hq_fortune_500_rank",
  "account_first_center_year", "years_in_india", "account_hq_website", "account_center_employees",
  "account_center_employees_range", "account_visibility", "account_visibility_note",
]

export const CENTER_COLUMNS = [
  "account_global_legal_name", "cn_unique_key", "center_status", "center_inc_year", "announced_year",
  "announced_month", "center_end_year", "center_name", "center_management_partner", "center_jv_status",
  "center_jv_name", "center_type", "center_focus", "center_website", "center_linkedin", "center_city",
  "center_state", "center_country", "center_country_iso2", "center_employees", "center_employees_range",
  "center_boardline", "center_account_website", "center_timeline", "center_address", "center_zip_code",
  "lat", "lng",
]

export const PROSPECT_COLUMNS = [
  "ps_unique_key", "account_global_legal_name", "prospect_full_name", "prospect_first_name",
  "prospect_last_name", "prospect_title", "prospect_department", "prospect_level", "head_type",
  "prospect_linkedin_url", "prospect_email", "prospect_city", "prospect_state", "prospect_country",
  "prospect_in_company_year", "prospect_current_year", "center_name",
]

// Same columns as getDashboardServices / getDashboardTech in app/actions/data.ts.
export const SERVICE_COLUMNS = [
  "cn_unique_key", "center_name", "primary_service", "focus_region", "service_it", "service_erd",
  "service_fna", "service_hr", "service_procurement", "service_sales_marketing",
  "service_customer_support", "service_others", "software_vendor", "software_in_use",
]

export const TECH_COLUMNS = [
  "account_global_legal_name", "cn_unique_key", "software_in_use", "software_vendor", "software_category",
]

/** account_hq_revenue is a bigint; cast so it deserializes as a number. */
export const ACCOUNT_PROJECTION = [
  ...ACCOUNT_COLUMNS.filter((c) => c !== "account_hq_revenue"),
  "account_hq_revenue::float8 as account_hq_revenue",
].join(", ")
