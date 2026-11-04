import type { Filters } from "@/lib/types"

type Bounds = { min: number; max: number }

export type RangeBaselines = {
  revenue: Bounds
  yearsInIndia: Bounds
  centerIncYear: Bounds
}

const isNarrowed = (range: [number, number], bounds: Bounds) => range[0] !== bounds.min || range[1] !== bounds.max

/**
 * How many filters are active: each selected value counts once, a list of
 * accounts counts by list (not by the names it expands to), a visibility
 * other than GCCs counts once, a range counts once when narrowed from its
 * baseline, and an "Include all" toggle counts once when switched off.
 */
export function countActiveFilters(filters: Filters, baselines: RangeBaselines): number {
  let count = 0
  count += filters.accountHqRegionValues.length
  if ((filters.accountVisibilityMode ?? "gcc") !== "gcc") count += 1
  count += filters.accountHqCountryValues.length
  count += filters.accountHqIndustryValues.length
  count += filters.accountPrimaryCategoryValues.length
  count += filters.accountPrimaryNatureValues.length
  count += filters.accountNasscomStatusValues.length
  count += filters.accountHqEmployeeRangeValues.length
  count += filters.accountCenterEmployeesRangeValues.length
  count += filters.accountGlobalLegalNameKeywords.length
  count += filters.accountListValues.length > 0 ? filters.accountListValues.length : filters.accountNameValues.length
  count += filters.centerTypeValues.length
  count += filters.centerFocusValues.length
  count += filters.centerCityValues.length
  count += filters.centerStateValues.length
  count += filters.centerEmployeesRangeValues.length
  count += filters.centerStatusValues.length
  count += filters.functionNameValues.length
  count += filters.techSoftwareInUseKeywords.length
  count += filters.prospectDepartmentValues.length
  count += filters.prospectHeadTypeValues.length
  count += filters.prospectLevelValues.length
  count += filters.prospectEngagedValues.length
  count += filters.prospectCityValues.length
  count += filters.prospectTitleKeywords.length

  if (isNarrowed(filters.accountHqRevenueRange, baselines.revenue)) count += 1
  if (isNarrowed(filters.accountYearsInIndiaRange, baselines.yearsInIndia)) count += 1
  if (isNarrowed(filters.centerIncYearRange, baselines.centerIncYear)) count += 1

  // "Include all" toggles are on by default; they only narrow the results
  // (and count as a filter) when switched off.
  if (!filters.accountHqRevenueIncludeNull) count += 1
  if (!filters.yearsInIndiaIncludeNull) count += 1
  if (!filters.centerIncYearIncludeNull) count += 1

  return count
}
