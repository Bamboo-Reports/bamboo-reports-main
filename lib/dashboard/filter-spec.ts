import type { Filters } from "@/lib/types"

/**
 * The sidebar's filter fields: section, order, label and kind, defined once.
 * The active-filter count, the filter description (export chips, saved
 * filters) and the summary PDF all derive from this, so a field is added or
 * renamed in one place. The sidebar itself still renders each field's control
 * in components/filters/filter-sections.tsx, in this order.
 */

export type FilterSectionId = "accounts" | "centers" | "prospects"

export const SECTION_LABELS: Record<FilterSectionId, string> = {
  accounts: "Accounts",
  centers: "Centres",
  prospects: "Prospects",
}

/** Money is stored in millions; "years" is a count and "year" a calendar year. */
export type RangeUnit = "money" | "years" | "year"

export type RangeFilterKey = "accountHqRevenueRange" | "accountYearsInIndiaRange" | "centerIncYearRange"
export type RangeBoundsKey = "revenue" | "yearsInIndia" | "centerIncYear"

export type FieldSpec =
  | { kind: "values"; key: keyof Filters; label: string }
  | {
      kind: "range"
      key: RangeFilterKey
      includeNullKey: "accountHqRevenueIncludeNull" | "yearsInIndiaIncludeNull" | "centerIncYearIncludeNull"
      bounds: RangeBoundsKey
      unit: RangeUnit
      label: string
    }
  | { kind: "accountList"; key: "accountListValues"; label: string }

export const SECTION_SPECS: Record<FilterSectionId, FieldSpec[]> = {
  accounts: [
    { kind: "values", key: "accountGlobalLegalNameKeywords", label: "Account name" },
    { kind: "accountList", key: "accountListValues", label: "Account list" },
    { kind: "range", key: "accountHqRevenueRange", includeNullKey: "accountHqRevenueIncludeNull", bounds: "revenue", unit: "money", label: "HQ revenue" },
    { kind: "values", key: "accountCenterEmployeesRangeValues", label: "GCC headcount (India)" },
    { kind: "range", key: "accountYearsInIndiaRange", includeNullKey: "yearsInIndiaIncludeNull", bounds: "yearsInIndia", unit: "years", label: "Years in India" },
    { kind: "values", key: "accountPrimaryCategoryValues", label: "Industry" },
    { kind: "values", key: "accountHqCountryValues", label: "HQ country" },
    { kind: "values", key: "accountHqRegionValues", label: "HQ region" },
    { kind: "values", key: "accountHqEmployeeRangeValues", label: "HQ employee range" },
    { kind: "values", key: "accountHqIndustryValues", label: "Sub industry" },
    { kind: "values", key: "accountPrimaryNatureValues", label: "Segment" },
    { kind: "values", key: "accountNasscomStatusValues", label: "NASSCOM listing" },
  ],
  centers: [
    { kind: "values", key: "centerStatusValues", label: "Status" },
    { kind: "values", key: "centerTypeValues", label: "Centre type" },
    { kind: "values", key: "functionNameValues", label: "Services offered" },
    { kind: "values", key: "centerCityValues", label: "City" },
    { kind: "range", key: "centerIncYearRange", includeNullKey: "centerIncYearIncludeNull", bounds: "centerIncYear", unit: "year", label: "Incorporation year" },
    { kind: "values", key: "centerEmployeesRangeValues", label: "Centre headcount" },
    { kind: "values", key: "centerStateValues", label: "State" },
    { kind: "values", key: "centerFocusValues", label: "Centre focus" },
    { kind: "values", key: "techSoftwareInUseKeywords", label: "Software in use" },
  ],
  prospects: [
    { kind: "values", key: "prospectTitleKeywords", label: "Job title" },
    { kind: "values", key: "prospectHeadTypeValues", label: "Role" },
    { kind: "values", key: "prospectLevelValues", label: "Level" },
    { kind: "values", key: "prospectDepartmentValues", label: "Department" },
    { kind: "values", key: "prospectCityValues", label: "City" },
    { kind: "values", key: "prospectEngagedValues", label: "Engaged" },
  ],
}

export const FILTER_SECTION_IDS = Object.keys(SECTION_SPECS) as FilterSectionId[]

/** The "Accounts to show" switch sits above the sections rather than in one. */
export const VISIBILITY_FIELD_LABEL = "Accounts to show"

/** Filter key to the label the sidebar shows for it. */
export const FIELD_LABELS: Partial<Record<keyof Filters, string>> = {
  accountVisibilityMode: VISIBILITY_FIELD_LABEL,
  ...Object.fromEntries(FILTER_SECTION_IDS.flatMap((section) => SECTION_SPECS[section].map((spec) => [spec.key, spec.label]))),
}
