import type { Filters } from "@/lib/types"
import {
  createDefaultFilters,
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"

const coerceRange = (
  value: number[] | undefined | null,
  fallback: [number, number]
): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return fallback
  const [min, max] = value
  return [Number(min), Number(max)]
}

export function withFilterDefaults(filters: Partial<Filters> | null | undefined): Filters {
  const defaults = createDefaultFilters()

  return {
    ...defaults,
    ...filters,
    accountHqRevenueRange: coerceRange(filters?.accountHqRevenueRange, DEFAULT_REVENUE_RANGE),
    accountYearsInIndiaRange: coerceRange(
      filters?.accountYearsInIndiaRange,
      DEFAULT_YEARS_IN_INDIA_RANGE
    ),
    centerIncYearRange: coerceRange(filters?.centerIncYearRange, DEFAULT_CENTER_INC_YEAR_RANGE),
  }
}

export function calculateActiveFilters(filters: Filters) {
  const [minRevenue, maxRevenue] = filters.accountHqRevenueRange || DEFAULT_REVENUE_RANGE
  const revenueFilterActive = minRevenue !== DEFAULT_REVENUE_RANGE[0] || maxRevenue !== DEFAULT_REVENUE_RANGE[1]
  const [minYearsInIndia, maxYearsInIndia] = filters.accountYearsInIndiaRange || DEFAULT_YEARS_IN_INDIA_RANGE
  const yearsInIndiaFilterActive =
    minYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[0] || maxYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[1]
  const [minCenterIncYear, maxCenterIncYear] = filters.centerIncYearRange || DEFAULT_CENTER_INC_YEAR_RANGE
  const centerIncYearFilterActive =
    minCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[0] || maxCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[1]

  return (
    ((filters.accountVisibilityMode ?? "gcc") !== "gcc" ? 1 : 0) +
    filters.accountHqRegionValues.length +
    filters.accountHqCountryValues.length +
    filters.accountHqIndustryValues.length +
    filters.accountDataCoverageValues.length +
    filters.accountSourceValues.length +
    filters.accountTypeValues.length +
    filters.accountPrimaryCategoryValues.length +
    filters.accountPrimaryNatureValues.length +
    filters.accountNasscomStatusValues.length +
    filters.accountHqEmployeeRangeValues.length +
    filters.accountCenterEmployeesRangeValues.length +
    (revenueFilterActive ? 1 : 0) +
    (filters.accountHqRevenueIncludeNull ? 1 : 0) +
    (yearsInIndiaFilterActive ? 1 : 0) +
    (filters.yearsInIndiaIncludeNull ? 1 : 0) +
    filters.accountGlobalLegalNameKeywords.length +
    filters.centerTypeValues.length +
    filters.centerFocusValues.length +
    filters.centerCityValues.length +
    filters.centerStateValues.length +
    filters.centerCountryValues.length +
    filters.centerEmployeesRangeValues.length +
    filters.centerStatusValues.length +
    (centerIncYearFilterActive ? 1 : 0) +
    (filters.centerIncYearIncludeNull ? 1 : 0) +
    filters.functionNameValues.length +
    filters.techSoftwareInUseKeywords.length +
    filters.prospectDepartmentValues.length +
    filters.prospectHeadTypeValues.length +
    filters.prospectLevelValues.length +
    filters.prospectCityValues.length +
    filters.prospectTitleKeywords.length
  )
}
