import type { FilterValue } from "@/lib/types"

type CompiledValueFilter = {
  includeSet: Set<string>
  excludeSet: Set<string>
}

type CompiledKeywordFilter = {
  includeKeywords: string[]
  excludeKeywords: string[]
}

const valueFilterCache = new WeakMap<FilterValue[], CompiledValueFilter>()
const keywordFilterCache = new WeakMap<FilterValue[], CompiledKeywordFilter>()

const getCompiledValueFilter = (filterArray: FilterValue[]): CompiledValueFilter => {
  const cached = valueFilterCache.get(filterArray)
  if (cached) return cached

  const includeSet = new Set<string>()
  const excludeSet = new Set<string>()

  for (const filter of filterArray) {
    if (filter.mode === "exclude") {
      excludeSet.add(filter.value)
    } else {
      includeSet.add(filter.value)
    }
  }

  const compiled = { includeSet, excludeSet }
  valueFilterCache.set(filterArray, compiled)
  return compiled
}

const getCompiledKeywordFilter = (filterArray: FilterValue[]): CompiledKeywordFilter => {
  const cached = keywordFilterCache.get(filterArray)
  if (cached) return cached

  const includeKeywords: string[] = []
  const excludeKeywords: string[] = []

  for (const filter of filterArray) {
    const value = filter.value.toLowerCase()
    if (filter.mode === "exclude") {
      excludeKeywords.push(value)
    } else {
      includeKeywords.push(value)
    }
  }

  const compiled = { includeKeywords, excludeKeywords }
  keywordFilterCache.set(filterArray, compiled)
  return compiled
}

export function createValueMatcher(filterArray: FilterValue[]) {
  if (filterArray.length === 0) {
    return () => true
  }

  const { includeSet, excludeSet } = getCompiledValueFilter(filterArray)

  return (value: string | null | undefined): boolean => {
    if (value == null) {
      return includeSet.size === 0
    }

    if (excludeSet.size > 0 && excludeSet.has(value)) {
      return false
    }

    if (includeSet.size > 0) {
      return includeSet.has(value)
    }

    return true
  }
}

/**
 * Lowercased forms an account-name pick can match (#308): the raw value, plus
 * the value with whitespace runs and zero-width spaces collapsed, so picks
 * saved with line breaks still match the warehouse name. Shared by the client
 * matcher and the SQL clause (lib/dashboard/filtering-sql.ts) to keep them equal.
 */
export function accountNameMatchForms(value: string): string[] {
  const lower = value.toLowerCase()
  const collapsed = lower.replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim()
  return collapsed === lower ? [lower] : [lower, collapsed]
}

/**
 * Account Name filter: whole-name, case-insensitive match against picked names
 * (#308). A NULL name is treated as "", so it passes excludes and fails includes.
 */
export function createAccountNameMatcher(filterArray: FilterValue[]) {
  if (filterArray.length === 0) {
    return () => true
  }

  const include = new Set(filterArray.filter((f) => f.mode !== "exclude").flatMap((f) => accountNameMatchForms(f.value)))
  const exclude = new Set(filterArray.filter((f) => f.mode === "exclude").flatMap((f) => accountNameMatchForms(f.value)))

  return (value: string | null | undefined): boolean => {
    const lowerValue = (value ?? "").toLowerCase()
    if (exclude.has(lowerValue)) return false
    if (include.size > 0) return include.has(lowerValue)
    return true
  }
}

export function createKeywordMatcher(filterArray: FilterValue[]) {
  if (filterArray.length === 0) {
    return () => true
  }

  const { includeKeywords, excludeKeywords } = getCompiledKeywordFilter(filterArray)

  return (value: string | null | undefined): boolean => {
    const lowerValue = (value ?? "").toLowerCase()

    if (excludeKeywords.length > 0 && excludeKeywords.some((keyword) => lowerValue.includes(keyword))) {
      return false
    }

    if (includeKeywords.length > 0) {
      return includeKeywords.some((keyword) => lowerValue.includes(keyword))
    }

    return true
  }
}

/**
 * Enhanced filter matching with include/exclude support
 * - If only include values: item must match at least one include value (OR logic)
 * - If only exclude values: item must not match any exclude value
 * - If both include and exclude: item must match at least one include AND not match any exclude
 * - If empty filter: match all
 */
export function enhancedFilterMatch(filterArray: FilterValue[], value: string | null | undefined): boolean {
  if (filterArray.length === 0) return true

  const { includeSet, excludeSet } = getCompiledValueFilter(filterArray)

  if (value == null) {
    return includeSet.size === 0
  }

  // Check exclude first (faster rejection)
  if (excludeSet.size > 0 && excludeSet.has(value)) {
    return false
  }

  // If there are include values, must match at least one
  if (includeSet.size > 0) {
    return includeSet.has(value)
  }

  // Only exclude values and didn't match any exclude = pass
  return true
}

/**
 * Keyword matching with include/exclude support for search fields
 * - Include keywords: value must contain at least one include keyword (OR logic)
 * - Exclude keywords: value must not contain any exclude keyword
 * - Both: must match include AND not match exclude
 */
export function enhancedKeywordMatch(filterArray: FilterValue[], value: string | null | undefined): boolean {
  if (filterArray.length === 0) return true

  const { includeKeywords, excludeKeywords } = getCompiledKeywordFilter(filterArray)
  const lowerValue = (value ?? "").toLowerCase()

  // Check exclude first (faster rejection)
  if (excludeKeywords.length > 0 && excludeKeywords.some((keyword) => lowerValue.includes(keyword))) {
    return false
  }

  // If there are include keywords, must contain at least one
  if (includeKeywords.length > 0) {
    return includeKeywords.some((keyword) => lowerValue.includes(keyword))
  }

  // Only exclude keywords and didn't match any exclude = pass
  return true
}

/**
 * Extract values from FilterValue array for backward compatibility
 */
export function extractFilterValues(filterArray: FilterValue[]): string[] {
  return filterArray.map(f => f.value)
}

/**
 * Convert string array to FilterValue array (for migration)
 */
export function toFilterValues(values: string[], mode: 'include' | 'exclude' = 'include'): FilterValue[] {
  return values.map(value => ({ value, mode }))
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(filterArray: FilterValue[]): boolean {
  return filterArray.length > 0
}

/**
 * Count filters by mode
 */
export function countFiltersByMode(filterArray: FilterValue[]): { include: number; exclude: number } {
  return {
    include: filterArray.filter(f => f.mode === 'include').length,
    exclude: filterArray.filter(f => f.mode === 'exclude').length,
  }
}
