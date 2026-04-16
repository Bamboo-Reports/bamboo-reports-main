import type { Filters } from "@/lib/types"

export const DEFAULT_REVENUE_RANGE: [number, number] = [0, 1000000]
export const DEFAULT_YEARS_IN_INDIA_RANGE: [number, number] = [0, 1000000]
export const DEFAULT_CENTER_INC_YEAR_RANGE: [number, number] = [0, 1000000]

export function createDefaultFilters(overrides: Partial<Filters> = {}): Filters {
  return {
    accountHqRegionValues: overrides.accountHqRegionValues ?? [],
    accountHqCountryValues: overrides.accountHqCountryValues ?? [],
    accountHqIndustryValues: overrides.accountHqIndustryValues ?? [],
    accountDataCoverageValues: overrides.accountDataCoverageValues ?? [],
    accountSourceValues: overrides.accountSourceValues ?? [],
    accountTypeValues: overrides.accountTypeValues ?? [],
    accountPrimaryCategoryValues: overrides.accountPrimaryCategoryValues ?? [],
    accountPrimaryNatureValues: overrides.accountPrimaryNatureValues ?? [],
    accountNasscomStatusValues: overrides.accountNasscomStatusValues ?? [],
    accountHqEmployeeRangeValues: overrides.accountHqEmployeeRangeValues ?? [],
    accountCenterEmployeesRangeValues: overrides.accountCenterEmployeesRangeValues ?? [],
    accountHqRevenueRange: overrides.accountHqRevenueRange ?? DEFAULT_REVENUE_RANGE,
    accountHqRevenueIncludeNull: overrides.accountHqRevenueIncludeNull ?? true,
    accountYearsInIndiaRange: overrides.accountYearsInIndiaRange ?? DEFAULT_YEARS_IN_INDIA_RANGE,
    yearsInIndiaIncludeNull: overrides.yearsInIndiaIncludeNull ?? true,
    accountGlobalLegalNameKeywords: overrides.accountGlobalLegalNameKeywords ?? [],
    centerTypeValues: overrides.centerTypeValues ?? [],
    centerFocusValues: overrides.centerFocusValues ?? [],
    centerCityValues: overrides.centerCityValues ?? [],
    centerStateValues: overrides.centerStateValues ?? [],
    centerCountryValues: overrides.centerCountryValues ?? [],
    centerEmployeesRangeValues: overrides.centerEmployeesRangeValues ?? [],
    centerStatusValues: overrides.centerStatusValues ?? [],
    centerIncYearRange: overrides.centerIncYearRange ?? DEFAULT_CENTER_INC_YEAR_RANGE,
    centerIncYearIncludeNull: overrides.centerIncYearIncludeNull ?? true,
    functionNameValues: overrides.functionNameValues ?? [],
    techSoftwareInUseKeywords: overrides.techSoftwareInUseKeywords ?? [],
    prospectDepartmentValues: overrides.prospectDepartmentValues ?? [],
    prospectHeadTypeValues: overrides.prospectHeadTypeValues ?? [],
    prospectLevelValues: overrides.prospectLevelValues ?? [],
    prospectCityValues: overrides.prospectCityValues ?? [],
    prospectTitleKeywords: overrides.prospectTitleKeywords ?? [],
  }
}
