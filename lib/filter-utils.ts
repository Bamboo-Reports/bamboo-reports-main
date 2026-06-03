import type { Filters, FilterValue } from "@/lib/types"
import { isFilterEnabled } from "@/lib/config/filters"

export function changedFilterKeys(prev: Filters, next: Filters): string[] {
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if ((prev as unknown as Record<string, unknown>)[key] !== (next as unknown as Record<string, unknown>)[key]) {
      changed.push(key)
    }
  }
  return changed
}

export function isNumberRange(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number"
}

export function serializeFilterValues(values: FilterValue[]): string[] {
  return values.map(({ value, mode }) => `${mode}:${value}`).sort()
}

interface ActiveFilterCountRanges {
  revenueRange: { min: number; max: number }
  yearsInIndiaRange: { min: number; max: number }
  centerIncYearRange: { min: number; max: number }
}

export function getActiveFilterCountFor(sourceFilters: Filters, ranges: ActiveFilterCountRanges): number {
  let count = 0
  const e = isFilterEnabled

  if (e("accountHqRegionValues")) count += sourceFilters.accountHqRegionValues.length
  if (e("accountVisibilityMode") && (sourceFilters.accountVisibilityMode ?? "gcc") !== "gcc") count += 1
  if (e("accountHqCountryValues")) count += sourceFilters.accountHqCountryValues.length
  if (e("accountHqIndustryValues")) count += sourceFilters.accountHqIndustryValues.length
  if (e("accountDataCoverageValues")) count += sourceFilters.accountDataCoverageValues.length
  if (e("accountSourceValues")) count += sourceFilters.accountSourceValues.length
  if (e("accountTypeValues")) count += sourceFilters.accountTypeValues.length
  if (e("accountPrimaryCategoryValues")) count += sourceFilters.accountPrimaryCategoryValues.length
  if (e("accountPrimaryNatureValues")) count += sourceFilters.accountPrimaryNatureValues.length
  if (e("accountNasscomStatusValues")) count += sourceFilters.accountNasscomStatusValues.length
  if (e("accountHqEmployeeRangeValues")) count += sourceFilters.accountHqEmployeeRangeValues.length
  if (e("accountCenterEmployeesRangeValues")) count += sourceFilters.accountCenterEmployeesRangeValues.length
  if (e("accountGlobalLegalNameKeywords")) count += sourceFilters.accountGlobalLegalNameKeywords.length
  if (e("centerTypeValues")) count += sourceFilters.centerTypeValues.length
  if (e("centerFocusValues")) count += sourceFilters.centerFocusValues.length
  if (e("centerCityValues")) count += sourceFilters.centerCityValues.length
  if (e("centerStateValues")) count += sourceFilters.centerStateValues.length
  if (e("centerCountryValues")) count += sourceFilters.centerCountryValues.length
  if (e("centerEmployeesRangeValues")) count += sourceFilters.centerEmployeesRangeValues.length
  if (e("centerStatusValues")) count += sourceFilters.centerStatusValues.length
  if (e("functionNameValues")) count += sourceFilters.functionNameValues.length
  if (e("techSoftwareInUseKeywords")) count += sourceFilters.techSoftwareInUseKeywords.length
  if (e("prospectDepartmentValues")) count += sourceFilters.prospectDepartmentValues.length
  if (e("prospectHeadTypeValues")) count += sourceFilters.prospectHeadTypeValues.length
  if (e("prospectLevelValues")) count += sourceFilters.prospectLevelValues.length
  if (e("prospectCityValues")) count += sourceFilters.prospectCityValues.length
  if (e("prospectTitleKeywords")) count += sourceFilters.prospectTitleKeywords.length

  if (
    e("accountHqRevenueRange") &&
    (sourceFilters.accountHqRevenueRange[0] !== ranges.revenueRange.min ||
      sourceFilters.accountHqRevenueRange[1] !== ranges.revenueRange.max)
  )
    count += 1
  if (
    e("accountYearsInIndiaRange") &&
    (sourceFilters.accountYearsInIndiaRange[0] !== ranges.yearsInIndiaRange.min ||
      sourceFilters.accountYearsInIndiaRange[1] !== ranges.yearsInIndiaRange.max)
  )
    count += 1
  if (
    e("centerIncYearRange") &&
    (sourceFilters.centerIncYearRange[0] !== ranges.centerIncYearRange.min ||
      sourceFilters.centerIncYearRange[1] !== ranges.centerIncYearRange.max)
  )
    count += 1

  if (e("accountHqRevenueIncludeNull") && sourceFilters.accountHqRevenueIncludeNull) count += 1
  if (e("yearsInIndiaIncludeNull") && sourceFilters.yearsInIndiaIncludeNull) count += 1
  if (e("centerIncYearIncludeNull") && sourceFilters.centerIncYearIncludeNull) count += 1

  return count
}
