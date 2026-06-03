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

const matchAccountVisibility = (visibility: Account["account_visibility"], mode: Filters["accountVisibilityMode"]) => {
  const resolvedMode = mode ?? "gcc"
  if (resolvedMode === "all") return true
  if (resolvedMode === "nonGcc") return visibility === "exclude"
  return visibility === "include"
}

export function getAccountNames(accounts: Account[]) {
  return Array.from(new Set(accounts.map((account) => account.account_global_legal_name).filter(Boolean)))
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
  const explicitExcludedSelected = resolvedFilteredAccounts.some((account) => account.account_visibility === "exclude")

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

function countOnly<T>(rows: T[], valueSelector: (row: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = String(valueSelector(row) ?? "")
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return counts
}

function toSortedOptions(map: Map<string, number>): FilterOption[] {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

function pickAccountValue(account: Account, key: string): string {
  if (key === "accountHqRegionValues") return account.account_hq_region ?? ""
  if (key === "accountHqCountryValues") return account.account_hq_country ?? ""
  if (key === "accountHqIndustryValues") return account.account_hq_industry ?? ""
  if (key === "accountDataCoverageValues") return account.account_data_coverage ?? ""
  if (key === "accountSourceValues") return account.account_source ?? ""
  if (key === "accountTypeValues") return account.account_type ?? ""
  if (key === "accountPrimaryCategoryValues") return account.account_primary_category ?? ""
  if (key === "accountPrimaryNatureValues") return account.account_primary_nature ?? ""
  if (key === "accountNasscomStatusValues") return account.account_nasscom_status ?? ""
  if (key === "accountHqEmployeeRangeValues") return account.account_hq_employee_range ?? ""
  if (key === "accountCenterEmployeesRangeValues") return account.account_center_employees_range ?? ""
  return ""
}

function pickCenterValue(center: Center, key: string): string {
  if (key === "centerTypeValues") return center.center_type ?? ""
  if (key === "centerFocusValues") return center.center_focus ?? ""
  if (key === "centerCityValues") return center.center_city ?? ""
  if (key === "centerStateValues") return center.center_state ?? ""
  if (key === "centerCountryValues") return center.center_country ?? ""
  if (key === "centerEmployeesRangeValues") return center.center_employees_range ?? ""
  if (key === "centerStatusValues") return center.center_status ?? ""
  return ""
}

function pickProspectValue(prospect: Prospect, key: string): string {
  if (key === "prospectDepartmentValues") return prospect.prospect_department ?? ""
  if (key === "prospectHeadTypeValues") return prospect.head_type ?? ""
  if (key === "prospectLevelValues") return prospect.prospect_level ?? ""
  if (key === "prospectCityValues") return prospect.prospect_city ?? ""
  return ""
}

/**
 * Entity-specific account filter that only runs account-level match
 * functions and returns accounts that pass the scoped filters.
 * Skips center/function/prospect/service looping entirely.
 */
function filterAccountsOnly(accounts: Account[], filters: AvailableOptionsFilterState): Account[] {
  const matchRegion = createValueMatcher(filters.accountHqRegionValues)
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
  const matchRevenue = (v: number | string | null | undefined) =>
    rangeFilterMatch(filters.accountHqRevenueRange, v, filters.accountHqRevenueIncludeNull, parseRevenueValue)
  const matchYears = (v: number | string | null | undefined) =>
    rangeFilterMatch(filters.accountYearsInIndiaRange, v, filters.yearsInIndiaIncludeNull)
  const matchName = createKeywordMatcher(filters.accountGlobalLegalNameKeywords)
  const hasExplicitNameSearch = filters.accountGlobalLegalNameKeywords.length > 0

  return accounts.filter((account) => {
    if (!matchRegion(account.account_hq_region)) return false
    if (!matchCountry(account.account_hq_country)) return false
    if (!matchIndustry(account.account_hq_industry)) return false
    if (!matchDataCoverage(account.account_data_coverage)) return false
    if (!matchSource(account.account_source)) return false
    if (!matchType(account.account_type)) return false
    if (!matchPrimaryCategory(account.account_primary_category)) return false
    if (!matchPrimaryNature(account.account_primary_nature)) return false
    if (!matchNasscom(account.account_nasscom_status)) return false
    if (!matchEmployeesRange(account.account_hq_employee_range)) return false
    if (!matchCenterEmployees(account.account_center_employees_range || "")) return false
    if (!matchRevenue(account.account_hq_revenue)) return false
    if (!matchYears(account.years_in_india)) return false
    if (!matchName(account.account_global_legal_name)) return false
    if (!hasExplicitNameSearch && !matchAccountVisibility(account.account_visibility, filters.accountVisibilityMode))
      return false
    return true
  })
}

/**
 * Entity-specific center filter that only runs center-level match
 * functions and returns centers that pass the scoped filters.
 * Skips account/function/prospect/service looping entirely.
 */
function filterCentersOnly(centers: Center[], filters: AvailableOptionsFilterState): Center[] {
  const matchType = createValueMatcher(filters.centerTypeValues)
  const matchFocus = createValueMatcher(filters.centerFocusValues)
  const matchCity = createValueMatcher(filters.centerCityValues)
  const matchState = createValueMatcher(filters.centerStateValues)
  const matchCountry = createValueMatcher(filters.centerCountryValues)
  const matchEmployees = createValueMatcher(filters.centerEmployeesRangeValues)
  const matchStatus = createValueMatcher(filters.centerStatusValues)
  const matchIncYear = (v: number | string | null | undefined) =>
    rangeFilterMatch(filters.centerIncYearRange, v, filters.centerIncYearIncludeNull)

  return centers.filter((center) => {
    if (!matchType(center.center_type)) return false
    if (!matchFocus(center.center_focus)) return false
    if (!matchCity(center.center_city)) return false
    if (!matchState(center.center_state)) return false
    if (!matchCountry(center.center_country)) return false
    if (!matchEmployees(center.center_employees_range)) return false
    if (!matchStatus(center.center_status)) return false
    if (!matchIncYear(center.center_inc_year)) return false
    return true
  })
}

/**
 * Entity-specific prospect filter that only runs prospect-level match
 * functions and returns prospects that pass the scoped filters.
 * Skips account/center/function/service looping entirely.
 */
function filterProspectsOnly(prospects: Prospect[], filters: AvailableOptionsFilterState): Prospect[] {
  const matchDepartment = createValueMatcher(filters.prospectDepartmentValues)
  const matchHeadType = createValueMatcher(filters.prospectHeadTypeValues)
  const matchLevel = createValueMatcher(filters.prospectLevelValues)
  const matchCity = createValueMatcher(filters.prospectCityValues)
  const matchTitle = createKeywordMatcher(filters.prospectTitleKeywords)

  return prospects.filter((prospect) => {
    if (!matchDepartment(prospect.prospect_department)) return false
    if (!matchHeadType(prospect.head_type)) return false
    if (!matchLevel(prospect.prospect_level)) return false
    if (!matchCity(prospect.prospect_city)) return false
    if (!matchTitle(prospect.prospect_title)) return false
    return true
  })
}

/**
 * Returns a copy of `filters` with the given facet's filter cleared.
 */
function withoutFacet<T extends AvailableOptionsFilterState>(filters: T, key: keyof AvailableOptions): T {
  const clone = { ...filters }
  ;(clone as Record<string, unknown>)[key] = []
  return clone
}

/**
 * Which entity type a facet key maps to.
 */
const ACCOUNT_FACETS: ReadonlySet<string> = new Set([
  "accountHqRegionValues",
  "accountHqCountryValues",
  "accountHqIndustryValues",
  "accountDataCoverageValues",
  "accountSourceValues",
  "accountTypeValues",
  "accountPrimaryCategoryValues",
  "accountPrimaryNatureValues",
  "accountNasscomStatusValues",
  "accountHqEmployeeRangeValues",
  "accountCenterEmployeesRangeValues",
])

const CENTER_FACETS: ReadonlySet<string> = new Set([
  "centerTypeValues",
  "centerFocusValues",
  "centerCityValues",
  "centerStateValues",
  "centerCountryValues",
  "centerEmployeesRangeValues",
  "centerStatusValues",
])

export function getAvailableOptions(
  accounts: Account[],
  centers: Center[],
  functions: Function[],
  prospects: Prospect[],
  tech: Tech[],
  filters: AvailableOptionsFilterState,
  access: FilteringAccess = {}
): AvailableOptions {
  const baseFilteredData = getFilteredData(
    accounts,
    centers,
    functions,
    [],
    prospects,
    tech,
    filters as Filters,
    access
  )

  const hasSelection = (key: string): boolean => {
    const val = (filters as Record<string, unknown>)[key]
    return Array.isArray(val) && val.length > 0
  }

  const baseAccountOpts = (key: string) =>
    toSortedOptions(countOnly(baseFilteredData.filteredAccounts, (a) => pickAccountValue(a, key)))
  const baseCenterOpts = (key: string) =>
    toSortedOptions(countOnly(baseFilteredData.filteredCenters, (c) => pickCenterValue(c, key)))
  const baseProspectOpts = (key: string) =>
    toSortedOptions(countOnly(baseFilteredData.filteredProspects, (p) => pickProspectValue(p, key)))
  const baseFunctionOpts = () => toSortedOptions(countOnly(baseFilteredData.filteredFunctions, (f) => f.function_name))

  const excludedAccountOpts = (key: string) => {
    const scoped = withoutFacet(filters, key as keyof AvailableOptions)
    return toSortedOptions(countOnly(filterAccountsOnly(accounts, scoped), (a) => pickAccountValue(a, key)))
  }

  const excludedCenterOpts = (key: string) => {
    const scoped = withoutFacet(filters, key as keyof AvailableOptions)
    return toSortedOptions(countOnly(filterCentersOnly(centers, scoped), (c) => pickCenterValue(c, key)))
  }

  const excludedProspectOpts = (key: string) => {
    const scoped = withoutFacet(filters, key as keyof AvailableOptions)
    return toSortedOptions(countOnly(filterProspectsOnly(prospects, scoped), (p) => pickProspectValue(p, key)))
  }

  const resolve = (key: string) => {
    if (hasSelection(key)) {
      if (ACCOUNT_FACETS.has(key)) return excludedAccountOpts(key)
      if (CENTER_FACETS.has(key)) return excludedCenterOpts(key)
      if (key === "functionNameValues") return baseFunctionOpts()
      return excludedProspectOpts(key)
    }
    if (ACCOUNT_FACETS.has(key)) return baseAccountOpts(key)
    if (CENTER_FACETS.has(key)) return baseCenterOpts(key)
    if (key === "functionNameValues") return baseFunctionOpts()
    return baseProspectOpts(key)
  }

  return {
    accountHqRegionValues: resolve("accountHqRegionValues"),
    accountHqCountryValues: resolve("accountHqCountryValues"),
    accountHqIndustryValues: resolve("accountHqIndustryValues"),
    accountDataCoverageValues: resolve("accountDataCoverageValues"),
    accountSourceValues: resolve("accountSourceValues"),
    accountTypeValues: resolve("accountTypeValues"),
    accountPrimaryCategoryValues: resolve("accountPrimaryCategoryValues"),
    accountPrimaryNatureValues: resolve("accountPrimaryNatureValues"),
    accountNasscomStatusValues: resolve("accountNasscomStatusValues"),
    accountHqEmployeeRangeValues: resolve("accountHqEmployeeRangeValues"),
    accountCenterEmployeesRangeValues: resolve("accountCenterEmployeesRangeValues"),
    centerTypeValues: resolve("centerTypeValues"),
    centerFocusValues: resolve("centerFocusValues"),
    centerCityValues: resolve("centerCityValues"),
    centerStateValues: resolve("centerStateValues"),
    centerCountryValues: resolve("centerCountryValues"),
    centerEmployeesRangeValues: resolve("centerEmployeesRangeValues"),
    centerStatusValues: resolve("centerStatusValues"),
    functionNameValues: resolve("functionNameValues"),
    prospectDepartmentValues: resolve("prospectDepartmentValues"),
    prospectHeadTypeValues: resolve("prospectHeadTypeValues"),
    prospectLevelValues: resolve("prospectLevelValues"),
    prospectCityValues: resolve("prospectCityValues"),
  }
}
