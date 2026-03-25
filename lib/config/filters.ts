/**
 * Filter Configuration
 *
 * Controls which filters are visible and active in the dashboard sidebar.
 * Set `enabled: false` to hide a filter from the UI and exclude it from
 * filtering logic. Disabled filters will not affect data results.
 *
 * To configure for different consumers / deployments:
 *   1. Toggle individual filters by setting `enabled` to true or false.
 *   2. Toggle an entire section by setting the section's `enabled` flag.
 *      When a section is disabled, all filters within it are hidden
 *      regardless of their individual `enabled` state.
 *
 * Filter keys match the keys in the `Filters` interface (lib/types.ts).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterType = "multi-select" | "keyword" | "range" | "boolean"

export interface FilterConfig {
  /** The key matching the Filters interface in lib/types.ts */
  key: string
  /** Human-readable label shown in the sidebar UI */
  label: string
  /** Whether this filter is currently visible and active */
  enabled: boolean
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
  /** Whether the entire section is visible */
  enabled: boolean
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
    enabled: true,
    filters: [
      {
        key: "accountHqRevenueRange",
        label: "Revenue (USDMn)",
        enabled: true,
        type: "range",
        column: "account_hq_revenue",
        table: "accounts",
        description: "Revenue range slider with min/max inputs",
      },
      {
        key: "accountHqRevenueIncludeNull",
        label: "Revenue — Include all",
        enabled: true,
        type: "boolean",
        column: "account_hq_revenue",
        table: "accounts",
        description: "Include accounts with no revenue data",
      },
      {
        key: "accountGlobalLegalNameKeywords",
        label: "Account Name",
        enabled: true,
        type: "keyword",
        column: "account_global_legal_name",
        table: "accounts",
        description: "Autocomplete search for account names",
      },
      {
        key: "accountHqEmployeeRangeValues",
        label: "Employee Range",
        enabled: true,
        type: "multi-select",
        column: "account_hq_employee_range",
        table: "accounts",
      },
      {
        key: "accountCenterEmployeesRangeValues",
        label: "Aggregate India Headcount",
        enabled: true,
        type: "multi-select",
        column: "account_center_employees_range",
        table: "accounts",
      },
      {
        key: "accountYearsInIndiaRange",
        label: "Years In India",
        enabled: true,
        type: "range",
        column: "years_in_india",
        table: "accounts",
        description: "Range slider for years of India presence",
      },
      {
        key: "yearsInIndiaIncludeNull",
        label: "Years In India — Include all",
        enabled: true,
        type: "boolean",
        column: "years_in_india",
        table: "accounts",
        description: "Include accounts with no years-in-India data",
      },
      {
        key: "accountHqRegionValues",
        label: "Region",
        enabled: true,
        type: "multi-select",
        column: "account_hq_region",
        table: "accounts",
      },
      {
        key: "accountHqCountryValues",
        label: "Country",
        enabled: true,
        type: "multi-select",
        column: "account_hq_country",
        table: "accounts",
      },
      {
        key: "accountPrimaryNatureValues",
        label: "Segment",
        enabled: true,
        type: "multi-select",
        column: "account_primary_nature",
        table: "accounts",
      },
      {
        key: "accountPrimaryCategoryValues",
        label: "Category",
        enabled: true,
        type: "multi-select",
        column: "account_primary_category",
        table: "accounts",
      },
      {
        key: "accountHqIndustryValues",
        label: "Industry",
        enabled: true,
        type: "multi-select",
        column: "account_hq_industry",
        table: "accounts",
      },
      {
        key: "accountNasscomStatusValues",
        label: "NASSCOM Status",
        enabled: true,
        type: "multi-select",
        column: "account_nasscom_status",
        table: "accounts",
      },
      {
        key: "accountSourceValues",
        label: "Source",
        enabled: false,
        type: "multi-select",
        column: "account_source",
        table: "accounts",
      },
      {
        key: "accountTypeValues",
        label: "Type",
        enabled: false,
        type: "multi-select",
        column: "account_type",
        table: "accounts",
      },
      {
        key: "accountDataCoverageValues",
        label: "Coverage",
        enabled: false,
        type: "multi-select",
        column: "account_data_coverage",
        table: "accounts",
      },
    ],
  },

  // ── Center Attributes ───────────────────────────────────────────────
  {
    id: "centers",
    label: "Center Attributes",
    enabled: true,
    filters: [
      {
        key: "centerIncYearRange",
        label: "Incorporation Timeline",
        enabled: true,
        type: "range",
        column: "center_inc_year",
        table: "centers",
        description: "Range slider for center incorporation year",
      },
      {
        key: "centerIncYearIncludeNull",
        label: "Incorporation Timeline — Include all",
        enabled: true,
        type: "boolean",
        column: "center_inc_year",
        table: "centers",
        description: "Include centers with no incorporation year",
      },
      {
        key: "centerStatusValues",
        label: "Status",
        enabled: true,
        type: "multi-select",
        column: "center_status",
        table: "centers",
      },
      {
        key: "centerEmployeesRangeValues",
        label: "Center Headcount",
        enabled: true,
        type: "multi-select",
        column: "center_employees_range",
        table: "centers",
      },
      {
        key: "centerCountryValues",
        label: "Country",
        enabled: true,
        type: "multi-select",
        column: "center_country",
        table: "centers",
      },
      {
        key: "centerStateValues",
        label: "State",
        enabled: true,
        type: "multi-select",
        column: "center_state",
        table: "centers",
      },
      {
        key: "centerCityValues",
        label: "City",
        enabled: true,
        type: "multi-select",
        column: "center_city",
        table: "centers",
      },
      {
        key: "centerFocusValues",
        label: "Focus",
        enabled: true,
        type: "multi-select",
        column: "center_focus",
        table: "centers",
      },
      {
        key: "centerTypeValues",
        label: "Type",
        enabled: true,
        type: "multi-select",
        column: "center_type",
        table: "centers",
      },
      {
        key: "functionNameValues",
        label: "Services Offered",
        enabled: true,
        type: "multi-select",
        column: "function_name",
        table: "functions",
        description: "Filters via functions table joined through cn_unique_key",
      },
      {
        key: "techSoftwareInUseKeywords",
        label: "Software In Use",
        enabled: true,
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
    enabled: true,
    filters: [
      {
        key: "prospectDepartmentValues",
        label: "Department",
        enabled: true,
        type: "multi-select",
        column: "prospect_department",
        table: "prospects",
      },
      {
        key: "prospectLevelValues",
        label: "Seniority Level",
        enabled: true,
        type: "multi-select",
        column: "prospect_level",
        table: "prospects",
      },
      {
        key: "prospectCityValues",
        label: "City",
        enabled: true,
        type: "multi-select",
        column: "prospect_city",
        table: "prospects",
      },
      {
        key: "prospectTitleKeywords",
        label: "Job Title",
        enabled: true,
        type: "keyword",
        column: "prospect_title",
        table: "prospects",
        description: "Keyword search for prospect job titles",
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set of all enabled filter keys (respects both section and filter level) */
const _enabledFilterKeys = new Set<string>()

for (const section of FILTER_SECTIONS) {
  if (!section.enabled) continue
  for (const filter of section.filters) {
    if (filter.enabled) {
      _enabledFilterKeys.add(filter.key)
    }
  }
}

/** Frozen set for runtime lookups — rebuild by restarting the dev server after config changes */
export const ENABLED_FILTER_KEYS: ReadonlySet<string> = _enabledFilterKeys

/** Check if a specific filter is enabled */
export function isFilterEnabled(filterKey: string): boolean {
  return ENABLED_FILTER_KEYS.has(filterKey)
}

/** Check if a section has any enabled filters */
export function isSectionVisible(sectionId: string): boolean {
  const section = FILTER_SECTIONS.find((s) => s.id === sectionId)
  if (!section || !section.enabled) return false
  return section.filters.some((f) => f.enabled)
}

/** Get the config for a specific section */
export function getSectionConfig(sectionId: string): FilterSectionConfig | undefined {
  return FILTER_SECTIONS.find((s) => s.id === sectionId)
}

/** Get all enabled filter keys for a specific section */
export function getEnabledFiltersForSection(sectionId: string): string[] {
  const section = FILTER_SECTIONS.find((s) => s.id === sectionId)
  if (!section || !section.enabled) return []
  return section.filters.filter((f) => f.enabled).map((f) => f.key)
}
