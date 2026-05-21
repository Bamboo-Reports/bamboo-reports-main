import type {
  Account,
  Center,
  Function,
  Service,
  Prospect,
  Tech,
  Filters,
  FilterOption,
  AvailableOptions,
} from "@/lib/types"
import { parseRevenue } from "@/lib/utils/helpers"
import { createValueMatcher, createKeywordMatcher } from "@/lib/utils/filter-helpers"

type FilteringAccess = {
  accountsEnabled?: boolean
  centersEnabled?: boolean
  prospectsEnabled?: boolean
}

export type FilteredData = {
  filteredAccounts: Account[]
  filteredCenters: Center[]
  filteredFunctions: Function[]
  filteredServices: Service[]
  filteredProspects: Prospect[]
  explicitExcludedSelected: boolean
}

export type RevenueRangeFilterState = Pick<
  Filters,
  | "accountVisibilityMode"
  | "accountHqRegionValues"
  | "accountHqCountryValues"
  | "accountHqIndustryValues"
  | "accountDataCoverageValues"
  | "accountSourceValues"
  | "accountTypeValues"
  | "accountPrimaryCategoryValues"
  | "accountPrimaryNatureValues"
  | "accountNasscomStatusValues"
  | "accountHqEmployeeRangeValues"
  | "accountCenterEmployeesRangeValues"
  | "accountYearsInIndiaRange"
  | "yearsInIndiaIncludeNull"
>

type AvailableOptionsFilterState = Pick<
  Filters,
  | "accountVisibilityMode"
  | "accountHqRegionValues"
  | "accountHqCountryValues"
  | "accountHqIndustryValues"
  | "accountDataCoverageValues"
  | "accountSourceValues"
  | "accountTypeValues"
  | "accountPrimaryCategoryValues"
  | "accountPrimaryNatureValues"
  | "accountNasscomStatusValues"
  | "accountHqEmployeeRangeValues"
  | "accountCenterEmployeesRangeValues"
  | "accountYearsInIndiaRange"
  | "yearsInIndiaIncludeNull"
  | "centerTypeValues"
  | "centerFocusValues"
  | "centerCityValues"
  | "centerStateValues"
  | "centerCountryValues"
  | "centerEmployeesRangeValues"
  | "centerStatusValues"
  | "centerIncYearRange"
  | "centerIncYearIncludeNull"
  | "functionNameValues"
  | "techSoftwareInUseKeywords"
  | "prospectDepartmentValues"
  | "prospectHeadTypeValues"
  | "prospectLevelValues"
  | "prospectCityValues"
  | "prospectTitleKeywords"
  | "accountGlobalLegalNameKeywords"
  | "accountHqRevenueRange"
  | "accountHqRevenueIncludeNull"
>

const normalizeNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0
  const num = typeof value === "number" ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

const parseRevenueValue = (value: number | string | null | undefined) => parseRevenue(value ?? 0)

const rangeFilterMatch = (
  range: [number, number],
  value: number | string | null | undefined,
  includeNull: boolean,
  parser: (value: number | string | null | undefined) => number = normalizeNumber
) => {
  const numValue = parser(value)

  if (includeNull && (numValue === 0 || value === null || value === undefined || value === "")) {
    return true
  }

  if (!includeNull && (numValue === 0 || value === null || value === undefined || value === "")) {
    return false
  }

  return numValue >= range[0] && numValue <= range[1]
}

const buildCenterSoftwareIndex = (tech: Tech[]) => {
  const centerSoftwareIndex = new Map<string, string>()
  for (const techRow of tech) {
    const software = techRow.software_in_use?.trim()
    if (!software || !techRow.cn_unique_key) continue
    const existing = centerSoftwareIndex.get(techRow.cn_unique_key)
    centerSoftwareIndex.set(techRow.cn_unique_key, existing ? `${existing} | ${software}` : software)
  }
  return centerSoftwareIndex
}

const matchAccountVisibility = (
  visibility: Account["account_visibility"],
  mode: Filters["accountVisibilityMode"]
) => {
  const resolvedMode = mode ?? "gcc"
  if (resolvedMode === "all") return true
  if (resolvedMode === "nonGcc") return visibility === "exclude"
  return visibility === "include"
}

export function getAccountNames(accounts: Account[]) {
  return Array.from(
    new Set(accounts.map((account) => account.account_global_legal_name).filter(Boolean))
  )
}

export function getFilteredData(
  accounts: Account[],
  centers: Center[],
  functions: Function[],
  services: Service[],
  prospects: Prospect[],
  tech: Tech[],
  filters: Filters,
  access: FilteringAccess = {}
): FilteredData {
  const accountsEnabled = access.accountsEnabled ?? true
  const centersEnabled = access.centersEnabled ?? true
  const prospectsEnabled = access.prospectsEnabled ?? true

  const matchAccountRegion = createValueMatcher(filters.accountHqRegionValues)
  const matchAccountCountry = createValueMatcher(filters.accountHqCountryValues)
  const matchAccountIndustry = createValueMatcher(filters.accountHqIndustryValues)
  const matchAccountDataCoverage = createValueMatcher(filters.accountDataCoverageValues)
  const matchAccountSource = createValueMatcher(filters.accountSourceValues)
  const matchAccountType = createValueMatcher(filters.accountTypeValues)
  const matchAccountPrimaryCategory = createValueMatcher(filters.accountPrimaryCategoryValues)
  const matchAccountPrimaryNature = createValueMatcher(filters.accountPrimaryNatureValues)
  const matchAccountNasscom = createValueMatcher(filters.accountNasscomStatusValues)
  const matchAccountEmployeesRange = createValueMatcher(filters.accountHqEmployeeRangeValues)
  const matchAccountCenterEmployees = createValueMatcher(filters.accountCenterEmployeesRangeValues)
  const matchAccountName = createKeywordMatcher(filters.accountGlobalLegalNameKeywords)
  const matchVisibility = (value: Account["account_visibility"]) =>
    matchAccountVisibility(value, filters.accountVisibilityMode)
  const matchAccountRevenue = (value: number | string | null | undefined) =>
    rangeFilterMatch(filters.accountHqRevenueRange, value, filters.accountHqRevenueIncludeNull, parseRevenueValue)
  const matchAccountYearsInIndia = (value: number | string | null | undefined) =>
    rangeFilterMatch(filters.accountYearsInIndiaRange, value, filters.yearsInIndiaIncludeNull)

  const matchCenterType = createValueMatcher(filters.centerTypeValues)
  const matchCenterFocus = createValueMatcher(filters.centerFocusValues)
  const matchCenterCity = createValueMatcher(filters.centerCityValues)
  const matchCenterState = createValueMatcher(filters.centerStateValues)
  const matchCenterCountry = createValueMatcher(filters.centerCountryValues)
  const matchCenterEmployees = createValueMatcher(filters.centerEmployeesRangeValues)
  const matchCenterStatus = createValueMatcher(filters.centerStatusValues)
  const matchCenterIncYear = (value: number | string | null | undefined) =>
    rangeFilterMatch(filters.centerIncYearRange, value, filters.centerIncYearIncludeNull)

  const matchFunctionType = createValueMatcher(filters.functionNameValues)
  const matchCenterSoftwareInUse = createKeywordMatcher(filters.techSoftwareInUseKeywords)

  const matchProspectDepartment = createValueMatcher(filters.prospectDepartmentValues)
  const matchProspectHeadType = createValueMatcher(filters.prospectHeadTypeValues)
  const matchProspectLevel = createValueMatcher(filters.prospectLevelValues)
  const matchProspectCity = createValueMatcher(filters.prospectCityValues)
  const matchProspectTitle = createKeywordMatcher(filters.prospectTitleKeywords)
  const hasExplicitAccountNameSearch = filters.accountGlobalLegalNameKeywords.length > 0

  const hasAccountFilters =
    filters.accountHqRegionValues.length > 0 ||
    filters.accountHqCountryValues.length > 0 ||
    filters.accountHqIndustryValues.length > 0 ||
    filters.accountDataCoverageValues.length > 0 ||
    filters.accountSourceValues.length > 0 ||
    filters.accountTypeValues.length > 0 ||
    filters.accountPrimaryCategoryValues.length > 0 ||
    filters.accountPrimaryNatureValues.length > 0 ||
    filters.accountNasscomStatusValues.length > 0 ||
    filters.accountHqEmployeeRangeValues.length > 0 ||
    filters.accountCenterEmployeesRangeValues.length > 0 ||
    (filters.accountVisibilityMode ?? "gcc") !== "all" ||
    filters.accountHqRevenueRange[0] > 0 ||
    filters.accountHqRevenueRange[1] < Number.MAX_SAFE_INTEGER ||
    filters.accountHqRevenueIncludeNull ||
    filters.accountYearsInIndiaRange[0] > 0 ||
    filters.accountYearsInIndiaRange[1] < Number.MAX_SAFE_INTEGER ||
    filters.yearsInIndiaIncludeNull ||
    filters.accountGlobalLegalNameKeywords.length > 0

  const hasProspectFilters =
    filters.prospectDepartmentValues.length > 0 ||
    filters.prospectHeadTypeValues.length > 0 ||
    filters.prospectLevelValues.length > 0 ||
    filters.prospectCityValues.length > 0 ||
    filters.prospectTitleKeywords.length > 0

  const hasFunctionFilters = filters.functionNameValues.length > 0
  const hasCenterSoftwareFilters = filters.techSoftwareInUseKeywords.length > 0

  let filteredAccounts: Account[] = []
  let filteredCenters: Center[] = []
  let filteredFunctions: Function[] = []
  let filteredProspects: Prospect[] = []

  let accountNameSet = new Set<string>()
  let centerKeySet = new Set<string>()

  const centerSoftwareIndex = buildCenterSoftwareIndex(tech)

  for (const account of accounts) {
    if (!matchAccountRegion(account.account_hq_region)) continue
    if (!matchAccountCountry(account.account_hq_country)) continue
    if (!matchAccountIndustry(account.account_hq_industry)) continue
    if (!matchAccountDataCoverage(account.account_data_coverage)) continue
    if (!matchAccountSource(account.account_source)) continue
    if (!matchAccountType(account.account_type)) continue
    if (!matchAccountPrimaryCategory(account.account_primary_category)) continue
    if (!matchAccountPrimaryNature(account.account_primary_nature)) continue
    if (!matchAccountNasscom(account.account_nasscom_status)) continue
    if (!matchAccountEmployeesRange(account.account_hq_employee_range)) continue
    if (!matchAccountCenterEmployees(account.account_center_employees_range || "")) continue
    if (!matchAccountRevenue(account.account_hq_revenue)) continue
    if (!matchAccountYearsInIndia(account.years_in_india)) continue
    if (!matchAccountName(account.account_global_legal_name)) continue
    if (!hasExplicitAccountNameSearch && !matchVisibility(account.account_visibility)) continue

    filteredAccounts.push(account)
    accountNameSet.add(account.account_global_legal_name)
  }

  if (centersEnabled) {
    for (const center of centers) {
      if (hasAccountFilters && !accountNameSet.has(center.account_global_legal_name)) continue
      if (!matchCenterType(center.center_type)) continue
      if (!matchCenterFocus(center.center_focus)) continue
      if (!matchCenterCity(center.center_city)) continue
      if (!matchCenterState(center.center_state)) continue
      if (!matchCenterCountry(center.center_country)) continue
      if (!matchCenterEmployees(center.center_employees_range)) continue
      if (!matchCenterStatus(center.center_status)) continue
      if (!matchCenterIncYear(center.center_inc_year)) continue
      if (hasCenterSoftwareFilters && !matchCenterSoftwareInUse(centerSoftwareIndex.get(center.cn_unique_key) ?? "")) {
        continue
      }

      filteredCenters.push(center)
      centerKeySet.add(center.cn_unique_key)
    }

    const functionCenterKeySet = new Set<string>()
    for (const func of functions) {
      if (!centerKeySet.has(func.cn_unique_key)) continue
      if (!hasFunctionFilters || matchFunctionType(func.function_name)) {
        filteredFunctions.push(func)
        if (hasFunctionFilters) {
          functionCenterKeySet.add(func.cn_unique_key)
        }
      }
    }

    if (hasFunctionFilters) {
      filteredCenters = filteredCenters.filter((center) => functionCenterKeySet.has(center.cn_unique_key))
      centerKeySet = functionCenterKeySet
    }
  }

  if (prospectsEnabled) {
    for (const prospect of prospects) {
      if (hasAccountFilters && !accountNameSet.has(prospect.account_global_legal_name)) continue
      const matchesProspect =
        matchProspectDepartment(prospect.prospect_department) &&
        matchProspectHeadType(prospect.head_type) &&
        matchProspectLevel(prospect.prospect_level) &&
        matchProspectCity(prospect.prospect_city) &&
        matchProspectTitle(prospect.prospect_title)

      if (matchesProspect || !hasProspectFilters) {
        filteredProspects.push(prospect)
      }
    }

    if (hasProspectFilters) {
      const accountNamesWithProspects = new Set<string>()
      for (const prospect of filteredProspects) {
        accountNamesWithProspects.add(prospect.account_global_legal_name)
      }

      filteredAccounts = filteredAccounts.filter((account) =>
        accountNamesWithProspects.has(account.account_global_legal_name)
      )
      accountNameSet = accountNamesWithProspects

      if (centersEnabled) {
        filteredCenters = filteredCenters.filter((center) => accountNameSet.has(center.account_global_legal_name))
        centerKeySet = new Set<string>()
        for (const center of filteredCenters) {
          centerKeySet.add(center.cn_unique_key)
        }
      }
    }
  }

  const filteredServices: Service[] = []
  if (centersEnabled) {
    for (const service of services) {
      if (centerKeySet.has(service.cn_unique_key)) {
        filteredServices.push(service)
      }
    }
  }

  const finalFilteredAccounts = centersEnabled
    ? filteredAccounts.filter((account) =>
        filteredCenters.some((center) => center.account_global_legal_name === account.account_global_legal_name)
      )
    : filteredAccounts

  const finalAccountNameSet = new Set<string>()
  if (accountsEnabled) {
    for (const account of finalFilteredAccounts) {
      finalAccountNameSet.add(account.account_global_legal_name)
    }
  } else if (centersEnabled) {
    for (const center of filteredCenters) {
      finalAccountNameSet.add(center.account_global_legal_name)
    }
  } else if (prospectsEnabled) {
    for (const prospect of filteredProspects) {
      finalAccountNameSet.add(prospect.account_global_legal_name)
    }
  }

  const finalFilteredFunctions = centersEnabled
    ? filteredFunctions.filter((func) => centerKeySet.has(func.cn_unique_key))
    : []
  const finalFilteredProspects = prospectsEnabled
    ? filteredProspects.filter((prospect) => finalAccountNameSet.has(prospect.account_global_legal_name))
    : []

  const resolvedFilteredAccounts = accountsEnabled ? finalFilteredAccounts : []
  const explicitExcludedSelected = resolvedFilteredAccounts.some(
    (account) => account.account_visibility === "exclude"
  )

  return {
    filteredAccounts: resolvedFilteredAccounts,
    filteredCenters: filteredCenters,
    filteredFunctions: finalFilteredFunctions,
    filteredServices: filteredServices,
    filteredProspects: finalFilteredProspects,
    explicitExcludedSelected,
  }
}

export function getDynamicRevenueRange(accounts: Account[], filters: RevenueRangeFilterState) {
  const matchRegion = createValueMatcher(filters.accountHqRegionValues)
  const matchVisibility = (value: Account["account_visibility"]) =>
    matchAccountVisibility(value, filters.accountVisibilityMode)
  const matchCountry = createValueMatcher(filters.accountHqCountryValues)
  const matchIndustry = createValueMatcher(filters.accountHqIndustryValues)
  const matchDataCoverage = createValueMatcher(filters.accountDataCoverageValues)
  const matchSource = createValueMatcher(filters.accountSourceValues)
  const matchType = createValueMatcher(filters.accountTypeValues)
  const matchPrimaryCategory = createValueMatcher(filters.accountPrimaryCategoryValues)
  const matchPrimaryNature = createValueMatcher(filters.accountPrimaryNatureValues)
  const matchNasscom = createValueMatcher(filters.accountNasscomStatusValues)
  const matchEmployeesRange = createValueMatcher(filters.accountHqEmployeeRangeValues)
  const matchCenterEmployees = createValueMatcher(filters.accountCenterEmployeesRangeValues)
  const matchYearsInIndiaRange = (value: number | string | null | undefined) =>
    rangeFilterMatch(filters.accountYearsInIndiaRange, value, filters.yearsInIndiaIncludeNull)

  const tempFilteredAccounts = accounts.filter((account) => {
    return (
      matchRegion(account.account_hq_region) &&
      matchCountry(account.account_hq_country) &&
      matchIndustry(account.account_hq_industry) &&
      matchDataCoverage(account.account_data_coverage) &&
      matchSource(account.account_source) &&
      matchType(account.account_type) &&
      matchPrimaryCategory(account.account_primary_category) &&
      matchPrimaryNature(account.account_primary_nature) &&
      matchNasscom(account.account_nasscom_status) &&
      matchEmployeesRange(account.account_hq_employee_range) &&
      matchCenterEmployees(account.account_center_employees_range || "") &&
      matchVisibility(account.account_visibility) &&
      matchYearsInIndiaRange(account.years_in_india)
    )
  })

  const validRevenues = tempFilteredAccounts
    .map((account) => parseRevenue(account.account_hq_revenue))
    .filter((rev) => rev > 0)

  if (validRevenues.length === 0) {
    return { min: 0, max: 1000000 }
  }

  return {
    min: Math.min(...validRevenues),
    max: Math.max(...validRevenues),
  }
}

export function getAvailableOptions(
  accounts: Account[],
  centers: Center[],
  functions: Function[],
  prospects: Prospect[],
  tech: Tech[],
  filters: AvailableOptionsFilterState,
  access: FilteringAccess = {}
): AvailableOptions {
  type FacetKey = keyof AvailableOptions

  const facetDataCache = new Map<FacetKey, FilteredData>()
  const baseFilteredData = getFilteredData(accounts, centers, functions, [], prospects, tech, filters as Filters, access)

  const hasActiveFacetSelection = (key: FacetKey) => filters[key].length > 0

  const getFacetData = (key: FacetKey) => {
    if (!hasActiveFacetSelection(key)) {
      return baseFilteredData
    }

    const cached = facetDataCache.get(key)
    if (cached) return cached

    const scopedFilters = {
      ...filters,
      [key]: [],
    } as Filters

    // Services are not needed to compute filter option counts.
    const scopedData = getFilteredData(accounts, centers, functions, [], prospects, tech, scopedFilters, access)
    facetDataCache.set(key, scopedData)
    return scopedData
  }

  const countValues = <T,>(rows: T[], valueSelector: (row: T) => string | null | undefined) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const value = String(valueSelector(row) ?? "")
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    return counts
  }

  const mapToSortedArray = (map: Map<string, number>): FilterOption[] =>
    Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)

  return {
    accountHqRegionValues: mapToSortedArray(
      countValues(getFacetData("accountHqRegionValues").filteredAccounts, (account) => account.account_hq_region)
    ),
    accountHqCountryValues: mapToSortedArray(
      countValues(getFacetData("accountHqCountryValues").filteredAccounts, (account) => account.account_hq_country)
    ),
    accountHqIndustryValues: mapToSortedArray(
      countValues(getFacetData("accountHqIndustryValues").filteredAccounts, (account) => account.account_hq_industry)
    ),
    accountDataCoverageValues: mapToSortedArray(
      countValues(getFacetData("accountDataCoverageValues").filteredAccounts, (account) => account.account_data_coverage)
    ),
    accountSourceValues: mapToSortedArray(
      countValues(getFacetData("accountSourceValues").filteredAccounts, (account) => account.account_source)
    ),
    accountTypeValues: mapToSortedArray(
      countValues(getFacetData("accountTypeValues").filteredAccounts, (account) => account.account_type)
    ),
    accountPrimaryCategoryValues: mapToSortedArray(
      countValues(
        getFacetData("accountPrimaryCategoryValues").filteredAccounts,
        (account) => account.account_primary_category
      )
    ),
    accountPrimaryNatureValues: mapToSortedArray(
      countValues(
        getFacetData("accountPrimaryNatureValues").filteredAccounts,
        (account) => account.account_primary_nature
      )
    ),
    accountNasscomStatusValues: mapToSortedArray(
      countValues(
        getFacetData("accountNasscomStatusValues").filteredAccounts,
        (account) => account.account_nasscom_status
      )
    ),
    accountHqEmployeeRangeValues: mapToSortedArray(
      countValues(
        getFacetData("accountHqEmployeeRangeValues").filteredAccounts,
        (account) => account.account_hq_employee_range
      )
    ),
    accountCenterEmployeesRangeValues: mapToSortedArray(
      countValues(
        getFacetData("accountCenterEmployeesRangeValues").filteredAccounts,
        (account) => account.account_center_employees_range || ""
      )
    ),
    centerTypeValues: mapToSortedArray(
      countValues(getFacetData("centerTypeValues").filteredCenters, (center) => center.center_type)
    ),
    centerFocusValues: mapToSortedArray(
      countValues(getFacetData("centerFocusValues").filteredCenters, (center) => center.center_focus)
    ),
    centerCityValues: mapToSortedArray(
      countValues(getFacetData("centerCityValues").filteredCenters, (center) => center.center_city)
    ),
    centerStateValues: mapToSortedArray(
      countValues(getFacetData("centerStateValues").filteredCenters, (center) => center.center_state)
    ),
    centerCountryValues: mapToSortedArray(
      countValues(getFacetData("centerCountryValues").filteredCenters, (center) => center.center_country)
    ),
    centerEmployeesRangeValues: mapToSortedArray(
      countValues(getFacetData("centerEmployeesRangeValues").filteredCenters, (center) => center.center_employees_range)
    ),
    centerStatusValues: mapToSortedArray(
      countValues(getFacetData("centerStatusValues").filteredCenters, (center) => center.center_status)
    ),
    functionNameValues: mapToSortedArray(
      countValues(getFacetData("functionNameValues").filteredFunctions, (func) => func.function_name)
    ),
    prospectDepartmentValues: mapToSortedArray(
      countValues(getFacetData("prospectDepartmentValues").filteredProspects, (prospect) => prospect.prospect_department)
    ),
    prospectHeadTypeValues: mapToSortedArray(
      countValues(getFacetData("prospectHeadTypeValues").filteredProspects, (prospect) => prospect.head_type)
    ),
    prospectLevelValues: mapToSortedArray(
      countValues(getFacetData("prospectLevelValues").filteredProspects, (prospect) => prospect.prospect_level)
    ),
    prospectCityValues: mapToSortedArray(
      countValues(getFacetData("prospectCityValues").filteredProspects, (prospect) => prospect.prospect_city)
    ),
  }
}
