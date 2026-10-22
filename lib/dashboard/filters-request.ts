import type { Filters, FilterValue, AccountVisibilityMode } from "@/lib/types"
import {
  createDefaultFilters,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
  DEFAULT_CENTER_INC_YEAR_RANGE,
} from "@/lib/dashboard/defaults"
import { sanitizeFilters } from "@/lib/config/filters"
import { isSectionEnabled } from "@/lib/config/dashboard-access"
import type { FilterAccess } from "@/lib/dashboard/filtering-sql"

// Every FilterValue[] field on Filters.
const VALUE_ARRAY_KEYS = [
  "accountHqRegionValues", "accountHqCountryValues", "accountHqIndustryValues", "accountDataCoverageValues",
  "accountSourceValues", "accountTypeValues", "accountPrimaryCategoryValues", "accountPrimaryNatureValues",
  "accountNasscomStatusValues", "accountHqEmployeeRangeValues", "accountCenterEmployeesRangeValues",
  "accountGlobalLegalNameKeywords", "accountNameValues", "accountListValues", "centerTypeValues", "centerFocusValues", "centerCityValues",
  "centerStateValues", "centerCountryValues", "centerEmployeesRangeValues", "centerStatusValues",
  "functionNameValues", "techSoftwareInUseKeywords", "prospectDepartmentValues", "prospectHeadTypeValues",
  "prospectLevelValues", "prospectEngagedValues", "prospectCityValues", "prospectTitleKeywords",
] as const

// Free-text keyword filters: each keyword becomes an ilike clause.
const KEYWORD_KEYS = new Set<string>(["accountGlobalLegalNameKeywords", "techSoftwareInUseKeywords", "prospectTitleKeywords"])

// Size caps for untrusted filter payloads, so one request cannot be made
// arbitrarily expensive (#294). Well above anything the dashboard sends: a
// value list holds at most every account (about 2.8K), the longest stored
// value is a prospect title (801 chars), and keywords are typed one by one.
// Matches the export route's MAX_FILTER_VALUES.
export const MAX_FILTER_VALUES = 5000
export const MAX_FILTER_VALUE_LENGTH = 1000
export const MAX_FILTER_KEYWORDS = 50
export const MAX_FILTER_KEYWORD_LENGTH = 200

function coerceFilterValues(input: unknown, limits: { count: number; length: number }): FilterValue[] {
  if (!Array.isArray(input)) return []
  const out: FilterValue[] = []
  for (const item of input) {
    if (out.length >= limits.count) break
    if (item && typeof item === "object" && typeof (item as { value?: unknown }).value === "string") {
      const value = (item as { value: string }).value
      if (value.length > limits.length) continue
      const mode = (item as { mode?: unknown }).mode === "exclude" ? "exclude" : "include"
      out.push({ value, mode })
    }
  }
  return out
}

function coerceRange(input: unknown, fallback: [number, number]): [number, number] {
  if (
    Array.isArray(input) &&
    input.length === 2 &&
    typeof input[0] === "number" &&
    typeof input[1] === "number" &&
    Number.isFinite(input[0]) &&
    Number.isFinite(input[1])
  ) {
    return [input[0], input[1]]
  }
  return [...fallback] as [number, number]
}

/**
 * Safely coerce an untrusted request body into a valid, sanitized Filters
 * object. Unknown/malformed fields fall back to defaults, value lists past the
 * size caps above are cut off, and disabled filters are reset (sanitizeFilters),
 * matching the client before it runs the engine.
 */
export function parseFilters(input: unknown): Filters {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const overrides: Partial<Filters> = {}
  for (const key of VALUE_ARRAY_KEYS) {
    const limits = KEYWORD_KEYS.has(key)
      ? { count: MAX_FILTER_KEYWORDS, length: MAX_FILTER_KEYWORD_LENGTH }
      : { count: MAX_FILTER_VALUES, length: MAX_FILTER_VALUE_LENGTH }
    ;(overrides as Record<string, FilterValue[]>)[key] = coerceFilterValues(src[key], limits)
  }
  overrides.accountHqRevenueRange = coerceRange(src.accountHqRevenueRange, DEFAULT_REVENUE_RANGE)
  overrides.accountYearsInIndiaRange = coerceRange(src.accountYearsInIndiaRange, DEFAULT_YEARS_IN_INDIA_RANGE)
  overrides.centerIncYearRange = coerceRange(src.centerIncYearRange, DEFAULT_CENTER_INC_YEAR_RANGE)
  overrides.accountHqRevenueIncludeNull =
    typeof src.accountHqRevenueIncludeNull === "boolean" ? src.accountHqRevenueIncludeNull : true
  overrides.yearsInIndiaIncludeNull =
    typeof src.yearsInIndiaIncludeNull === "boolean" ? src.yearsInIndiaIncludeNull : true
  overrides.centerIncYearIncludeNull =
    typeof src.centerIncYearIncludeNull === "boolean" ? src.centerIncYearIncludeNull : true
  const vm = src.accountVisibilityMode
  overrides.accountVisibilityMode =
    vm === "all" || vm === "nonGcc" || vm === "gcc" ? (vm as AccountVisibilityMode) : "gcc"

  return sanitizeFilters(createDefaultFilters(overrides))
}

/** Server-side section entitlement (deployment config), mirrors the client. */
export function resolveAccess(): FilterAccess {
  return {
    accountsEnabled: isSectionEnabled("accounts"),
    centersEnabled: isSectionEnabled("centers"),
    prospectsEnabled: isSectionEnabled("prospects"),
  }
}
