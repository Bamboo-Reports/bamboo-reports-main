/**
 * Filter Configuration
 *
 * Metadata for the dashboard sidebar filters, grouped by section: labels,
 * control types, the columns they target, and which filters sit under each
 * section's "More" divider.
 *
 * Filter keys match the keys in the `Filters` interface (lib/types.ts).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterType = "multi-select" | "keyword" | "range" | "boolean" | "single-select"

export interface FilterConfig {
  /** The key matching the Filters interface in lib/types.ts */
  key: string
  /** Human-readable label shown in the sidebar UI */
  label: string
  /** Filter control type */
  type: FilterType
  /** Database column(s) this filter targets */
  column: string
  /** Database table this filter targets */
  table: string
  /** Optional description for documentation / tooling */
  description?: string
}

export interface FilterSectionConfig {
  /** Section identifier */
  id: string
  /** Display label for the accordion header */
  label: string
  /** Less-used filters, listed under the "More" divider in the sidebar */
  moreFilterKeys?: string[]
  /** Filters within this section */
  filters: FilterConfig[]
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const FILTER_SECTIONS: FilterSectionConfig[] = [
  // ── Account Attributes ──────────────────────────────────────────────
  {
    id: "accounts",
    label: "Account Attributes",
    moreFilterKeys: [
      "accountHqRegionValues",
      "accountHqEmployeeRangeValues",
      "accountHqIndustryValues",
      "accountPrimaryNatureValues",
      "accountNasscomStatusValues",
    ],
    filters: [
      {
        key: "accountVisibilityMode",
        label: "Account Visibility",
        type: "single-select",
        column: "account_visibility",
        table: "accounts",
        description: "Switches between all accounts, GCC accounts, and non-GCC accounts",
      },
      {
        key: "accountGlobalLegalNameKeywords",
        label: "Account Name",
        type: "keyword",
        column: "account_global_legal_name",
        table: "accounts",
        description: "Account names picked from the autocomplete, matched as whole names",
      },
      {
        key: "accountListValues",
        label: "Account List",
        type: "multi-select",
        column: "account_global_legal_name",
        table: "accounts",
        description: "Uploaded client account lists, applied as exact account names",
      },
      {
        key: "accountNameValues",
        label: "Account List Accounts",
        type: "multi-select",
        column: "account_global_legal_name",
        table: "accounts",
        description: "Exact account names derived from the selected account lists",
      },
      {
        key: "accountHqRevenueRange",
        label: "HQ Company Revenue",
        type: "range",
        column: "account_hq_revenue",
        table: "accounts",
        description: "Revenue range slider with min/max inputs",
      },
      {
        key: "accountHqRevenueIncludeNull",
        label: "Revenue: Include all",
        type: "boolean",
        column: "account_hq_revenue",
        table: "accounts",
        description: "Include accounts with no revenue data",
      },
      {
        key: "accountCenterEmployeesRangeValues",
        label: "GCC Aggregate Headcount (India)",
        type: "multi-select",
        column: "account_center_employees_range",
        table: "accounts",
      },
      {
        key: "accountYearsInIndiaRange",
        label: "Years In India",
        type: "range",
        column: "years_in_india",
        table: "accounts",
        description: "Range slider for years of India presence",
      },
      {
        key: "yearsInIndiaIncludeNull",
        label: "Years In India: Include all",
        type: "boolean",
        column: "years_in_india",
        table: "accounts",
        description: "Include accounts with no years-in-India data",
      },
      {
        key: "accountPrimaryCategoryValues",
        label: "Industry",
        type: "multi-select",
        column: "account_primary_category",
        table: "accounts",
      },
      {
        key: "accountHqCountryValues",
        label: "HQ Country",
        type: "multi-select",
        column: "account_hq_country",
        table: "accounts",
      },
      {
        key: "accountHqRegionValues",
        label: "HQ Region",
        type: "multi-select",
        column: "account_hq_region",
        table: "accounts",
      },
      {
        key: "accountHqEmployeeRangeValues",
        label: "HQ Employee Range",
        type: "multi-select",
        column: "account_hq_employee_range",
        table: "accounts",
      },
      {
        key: "accountHqIndustryValues",
        label: "Sub Industry",
        type: "multi-select",
        column: "account_hq_industry",
        table: "accounts",
      },
      {
        key: "accountPrimaryNatureValues",
        label: "Segment",
        type: "multi-select",
        column: "account_primary_nature",
        table: "accounts",
      },
      {
        key: "accountNasscomStatusValues",
        label: "NASSCOM GCC Listing Status",
        type: "multi-select",
        column: "account_nasscom_status",
        table: "accounts",
      },
    ],
  },

  // ── Center Attributes ───────────────────────────────────────────────
  {
    id: "centers",
    label: "Center Attributes",
    moreFilterKeys: [
      "centerStateValues",
      "centerFocusValues",
      "techSoftwareInUseKeywords",
    ],
    filters: [
      {
        key: "centerStatusValues",
        label: "Status",
        type: "multi-select",
        column: "center_status",
        table: "centers",
      },
      {
        key: "centerTypeValues",
        label: "Center Type",
        type: "multi-select",
        column: "center_type",
        table: "centers",
      },
      {
        key: "functionNameValues",
        label: "Services Offered",
        type: "multi-select",
        column: "function_name",
        table: "functions",
        description: "Filters via functions table joined through cn_unique_key",
      },
      {
        key: "centerCityValues",
        label: "City",
        type: "multi-select",
        column: "center_city",
        table: "centers",
      },
      {
        key: "centerIncYearRange",
        label: "Incorporation Timeline",
        type: "range",
        column: "center_inc_year",
        table: "centers",
        description: "Range slider for center incorporation year",
      },
      {
        key: "centerIncYearIncludeNull",
        label: "Incorporation Timeline: Include all",
        type: "boolean",
        column: "center_inc_year",
        table: "centers",
        description: "Include centers with no incorporation year",
      },
      {
        key: "centerEmployeesRangeValues",
        label: "Center Headcount",
        type: "multi-select",
        column: "center_employees_range",
        table: "centers",
      },
      {
        key: "centerStateValues",
        label: "State",
        type: "multi-select",
        column: "center_state",
        table: "centers",
      },
      {
        key: "centerFocusValues",
        label: "Center Focus",
        type: "multi-select",
        column: "center_focus",
        table: "centers",
      },
      {
        key: "techSoftwareInUseKeywords",
        label: "Software In Use",
        type: "keyword",
        column: "software_in_use",
        table: "tech",
        description: "Keyword search via tech table joined through cn_unique_key",
      },
    ],
  },

  // ── Prospect Attributes ─────────────────────────────────────────────
  {
    id: "prospects",
    label: "Prospect Attributes",
    filters: [
      {
        key: "prospectTitleKeywords",
        label: "Job Title",
        type: "keyword",
        column: "prospect_title",
        table: "prospects",
        description: "Keyword search for prospect job titles",
      },
      {
        key: "prospectHeadTypeValues",
        label: "Role",
        type: "multi-select",
        column: "head_type",
        table: "prospects",
      },
      {
        key: "prospectLevelValues",
        label: "Seniority Level",
        type: "multi-select",
        column: "prospect_level",
        table: "prospects",
      },
      {
        key: "prospectDepartmentValues",
        label: "Department",
        type: "multi-select",
        column: "prospect_department",
        table: "prospects",
      },
      {
        key: "prospectCityValues",
        label: "City",
        type: "multi-select",
        column: "prospect_city",
        table: "prospects",
      },
      {
        key: "prospectEngagedValues",
        label: "Engaged",
        type: "multi-select",
        column: "prospect_engaged",
        table: "prospects",
        description: "Whether the prospect has engaged with a Bamboo Reports campaign",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filters listed under the "More" divider for a section */
export function getMoreFilterKeys(sectionId: string): string[] {
  const section = FILTER_SECTIONS.find((s) => s.id === sectionId)
  if (!section) return []
  return section.moreFilterKeys ?? []
}
