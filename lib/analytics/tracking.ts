import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import { getFilterMetadata } from "@/lib/analytics/filter-metadata"
import type { FilterValue, Filters } from "@/lib/types"

export const MAX_TRACKED_VALUES = 100
export const MAX_TRACKED_TEXT_LENGTH = 200

export const normalizeTrackedText = (value: string) => value.trim().slice(0, MAX_TRACKED_TEXT_LENGTH)

export const toTrackedStringArray = (
  values: Array<string | null | undefined>,
  maxValues = MAX_TRACKED_VALUES
) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (typeof value !== "string") {
      continue
    }

    const normalized = normalizeTrackedText(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)

    if (result.length >= maxValues) {
      break
    }
  }

  return result
}

export const toTrackedFilterValueArray = (values: FilterValue[]) =>
  toTrackedStringArray(values.map((value) => `${value.mode}:${value.value}`))

export const toTrackedFilterPlainValues = (values: FilterValue[]) =>
  toTrackedStringArray(values.map((value) => value.value))

const hasRangeChanged = (range: [number, number], baseline: [number, number]) =>
  range[0] !== baseline[0] || range[1] !== baseline[1]

export const buildTrackedFiltersSnapshot = (
  filters: Filters,
  baselineRanges: Partial<{
    accountHqRevenueRange: [number, number]
    accountYearsInIndiaRange: [number, number]
    centerIncYearRange: [number, number]
  }> = {}
) => {
  const activeFilterKeys: string[] = []

  const pushIfActive = (key: string, isActive: boolean) => {
    if (isActive) {
      activeFilterKeys.push(key)
    }
  }

  pushIfActive("accountHqRegionValues", filters.accountHqRegionValues.length > 0)
  pushIfActive("accountVisibilityMode", (filters.accountVisibilityMode ?? "gcc") !== "gcc")
  pushIfActive("accountHqCountryValues", filters.accountHqCountryValues.length > 0)
  pushIfActive("accountHqIndustryValues", filters.accountHqIndustryValues.length > 0)
  pushIfActive("accountDataCoverageValues", filters.accountDataCoverageValues.length > 0)
  pushIfActive("accountSourceValues", filters.accountSourceValues.length > 0)
  pushIfActive("accountTypeValues", filters.accountTypeValues.length > 0)
  pushIfActive("accountPrimaryCategoryValues", filters.accountPrimaryCategoryValues.length > 0)
  pushIfActive("accountPrimaryNatureValues", filters.accountPrimaryNatureValues.length > 0)
  pushIfActive("accountNasscomStatusValues", filters.accountNasscomStatusValues.length > 0)
  pushIfActive("accountHqEmployeeRangeValues", filters.accountHqEmployeeRangeValues.length > 0)
  pushIfActive("accountCenterEmployeesRangeValues", filters.accountCenterEmployeesRangeValues.length > 0)
  pushIfActive(
    "accountHqRevenueRange",
    baselineRanges.accountHqRevenueRange
      ? hasRangeChanged(filters.accountHqRevenueRange, baselineRanges.accountHqRevenueRange)
      : false
  )
  pushIfActive("accountHqRevenueIncludeNull", filters.accountHqRevenueIncludeNull)
  pushIfActive(
    "accountYearsInIndiaRange",
    baselineRanges.accountYearsInIndiaRange
      ? hasRangeChanged(filters.accountYearsInIndiaRange, baselineRanges.accountYearsInIndiaRange)
      : false
  )
  pushIfActive("yearsInIndiaIncludeNull", filters.yearsInIndiaIncludeNull)
  pushIfActive("accountGlobalLegalNameKeywords", filters.accountGlobalLegalNameKeywords.length > 0)
  pushIfActive("centerTypeValues", filters.centerTypeValues.length > 0)
  pushIfActive("centerFocusValues", filters.centerFocusValues.length > 0)
  pushIfActive("centerCityValues", filters.centerCityValues.length > 0)
  pushIfActive("centerStateValues", filters.centerStateValues.length > 0)
  pushIfActive("centerCountryValues", filters.centerCountryValues.length > 0)
  pushIfActive("centerEmployeesRangeValues", filters.centerEmployeesRangeValues.length > 0)
  pushIfActive("centerStatusValues", filters.centerStatusValues.length > 0)
  pushIfActive(
    "centerIncYearRange",
    baselineRanges.centerIncYearRange
      ? hasRangeChanged(filters.centerIncYearRange, baselineRanges.centerIncYearRange)
      : false
  )
  pushIfActive("centerIncYearIncludeNull", filters.centerIncYearIncludeNull)
  pushIfActive("functionNameValues", filters.functionNameValues.length > 0)
  pushIfActive("techSoftwareInUseKeywords", filters.techSoftwareInUseKeywords.length > 0)
  pushIfActive("prospectDepartmentValues", filters.prospectDepartmentValues.length > 0)
  pushIfActive("prospectHeadTypeValues", filters.prospectHeadTypeValues.length > 0)
  pushIfActive("prospectLevelValues", filters.prospectLevelValues.length > 0)
  pushIfActive("prospectCityValues", filters.prospectCityValues.length > 0)
  pushIfActive("prospectTitleKeywords", filters.prospectTitleKeywords.length > 0)

  return {
    active_filters_count: calculateActiveFilters(filters),
    active_filter_keys: activeFilterKeys,
    active_filter_names: activeFilterKeys.map((key) => getFilterMetadata(key as keyof Filters).label),
    active_filter_details: activeFilterKeys.map((key) => {
      const metadata = getFilterMetadata(key as keyof Filters)
      return {
        key,
        name: metadata.label,
        group: metadata.group,
        input_type: metadata.inputType,
      }
    }),
    account_visibility_mode: filters.accountVisibilityMode ?? "gcc",
    account_regions: toTrackedFilterValueArray(filters.accountHqRegionValues),
    account_countries: toTrackedFilterValueArray(filters.accountHqCountryValues),
    account_industries: toTrackedFilterValueArray(filters.accountHqIndustryValues),
    account_data_coverage: toTrackedFilterValueArray(filters.accountDataCoverageValues),
    account_sources: toTrackedFilterValueArray(filters.accountSourceValues),
    account_types: toTrackedFilterValueArray(filters.accountTypeValues),
    account_primary_categories: toTrackedFilterValueArray(filters.accountPrimaryCategoryValues),
    account_primary_natures: toTrackedFilterValueArray(filters.accountPrimaryNatureValues),
    account_nasscom_statuses: toTrackedFilterValueArray(filters.accountNasscomStatusValues),
    account_employees_ranges: toTrackedFilterValueArray(filters.accountHqEmployeeRangeValues),
    account_center_employees: toTrackedFilterValueArray(filters.accountCenterEmployeesRangeValues),
    account_revenue_range_min: filters.accountHqRevenueRange[0],
    account_revenue_range_max: filters.accountHqRevenueRange[1],
    include_null_revenue: filters.accountHqRevenueIncludeNull,
    account_years_in_india_range_min: filters.accountYearsInIndiaRange[0],
    account_years_in_india_range_max: filters.accountYearsInIndiaRange[1],
    include_null_years_in_india: filters.yearsInIndiaIncludeNull,
    account_name_keywords: toTrackedFilterValueArray(filters.accountGlobalLegalNameKeywords),
    center_types: toTrackedFilterValueArray(filters.centerTypeValues),
    center_focus: toTrackedFilterValueArray(filters.centerFocusValues),
    center_cities: toTrackedFilterValueArray(filters.centerCityValues),
    center_states: toTrackedFilterValueArray(filters.centerStateValues),
    center_countries: toTrackedFilterValueArray(filters.centerCountryValues),
    center_employees: toTrackedFilterValueArray(filters.centerEmployeesRangeValues),
    center_statuses: toTrackedFilterValueArray(filters.centerStatusValues),
    center_inc_year_range_min: filters.centerIncYearRange[0],
    center_inc_year_range_max: filters.centerIncYearRange[1],
    include_null_center_inc_year: filters.centerIncYearIncludeNull,
    function_types: toTrackedFilterValueArray(filters.functionNameValues),
    center_software_in_use_keywords: toTrackedFilterValueArray(filters.techSoftwareInUseKeywords),
    prospect_departments: toTrackedFilterValueArray(filters.prospectDepartmentValues),
    prospect_head_types: toTrackedFilterValueArray(filters.prospectHeadTypeValues),
    prospect_levels: toTrackedFilterValueArray(filters.prospectLevelValues),
    prospect_cities: toTrackedFilterValueArray(filters.prospectCityValues),
    prospect_title_keywords: toTrackedFilterValueArray(filters.prospectTitleKeywords),
  }
}
