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

export type RangeBounds = { min: number; max: number }

/** The data's full extent for each range filter, when the caller knows it. */
export interface FilterRangeBounds {
  revenue?: RangeBounds
  yearsInIndia?: RangeBounds
  centerIncYear?: RangeBounds
}

// A range narrows results only when it is not the "no limit" default and,
// when the data's bounds are known, it cuts into them. Ranges are stored at the
// data's bounds once data loads, so comparing with the default alone would
// count every untouched range.
function isRangeActive(range: [number, number] | undefined, fallback: [number, number], bounds?: RangeBounds) {
  const [min, max] = range || fallback
  if (min === fallback[0] && max === fallback[1]) return false
  return bounds ? min > bounds.min || max < bounds.max : true
}

export function calculateActiveFilters(filters: Filters, bounds: FilterRangeBounds = {}) {
  const revenueFilterActive = isRangeActive(filters.accountHqRevenueRange, DEFAULT_REVENUE_RANGE, bounds.revenue)
  const yearsInIndiaFilterActive = isRangeActive(filters.accountYearsInIndiaRange, DEFAULT_YEARS_IN_INDIA_RANGE, bounds.yearsInIndia)
  const centerIncYearFilterActive = isRangeActive(filters.centerIncYearRange, DEFAULT_CENTER_INC_YEAR_RANGE, bounds.centerIncYear)

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
    (filters.accountHqRevenueIncludeNull ? 0 : 1) +
    (yearsInIndiaFilterActive ? 1 : 0) +
    (filters.yearsInIndiaIncludeNull ? 0 : 1) +
    filters.accountGlobalLegalNameKeywords.length +
    (filters.accountListValues.length > 0 ? filters.accountListValues.length : filters.accountNameValues.length) +
    filters.centerTypeValues.length +
    filters.centerFocusValues.length +
    filters.centerCityValues.length +
    filters.centerStateValues.length +
    filters.centerCountryValues.length +
    filters.centerEmployeesRangeValues.length +
    filters.centerStatusValues.length +
    (centerIncYearFilterActive ? 1 : 0) +
    (filters.centerIncYearIncludeNull ? 0 : 1) +
    filters.functionNameValues.length +
    filters.techSoftwareInUseKeywords.length +
    filters.prospectDepartmentValues.length +
    filters.prospectHeadTypeValues.length +
    filters.prospectLevelValues.length +
    filters.prospectEngagedValues.length +
    filters.prospectCityValues.length +
    filters.prospectTitleKeywords.length
  )
}
