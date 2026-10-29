/**
 * Parse revenue value from string or number
 */
export const parseRevenue = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0
  const numValue = typeof value === "string" ? Number.parseFloat(value) : value
  return isNaN(numValue) ? 0 : numValue
}

/**
 * Format revenue in millions
 */
export const formatRevenueInMillions = (value: number): string => {
  return `${value.toLocaleString()}M`
}

/**
 * Get paginated data
 */
export const getPaginatedData = (data: any[], page: number, itemsPerPage: number) => {
  const startIndex = (page - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  return data.slice(startIndex, endIndex)
}

/**
 * Get total pages for pagination
 */
export const getTotalPages = (totalItems: number, itemsPerPage: number) => {
  if (itemsPerPage <= 0) return 1
  return Math.ceil(totalItems / itemsPerPage)
}

/**
 * Get page info for pagination display
 */
export const getPageInfo = (currentPage: number, totalItems: number, itemsPerPage: number) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)
  return { startItem, endItem, totalItems }
}

/**
 * Copy text to clipboard
 */
export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
}

/**
 * Builds a human-readable location string for a prospect.
 * Values that are null, empty, or exactly "TBA" (case-insensitive) are ignored.
 * If nothing meaningful remains after filtering, falls back to `country`, then "India".
 */
export const formatProspectLocation = (
  city: string | null | undefined,
  state: string | null | undefined,
  country?: string | null | undefined,
): string => {
  const isMeaningful = (v: string | null | undefined): v is string =>
    !!v && v.trim() !== "" && v.trim().toUpperCase() !== "TBA"

  if (isMeaningful(city)) {
    return isMeaningful(state) ? `${city.trim()}, ${state.trim()}` : city.trim()
  }
  if (isMeaningful(country)) return country
  return "India"
}
/**
 * Builds a human-readable location string for a center.
 * A city that is null, empty, or exactly "TBA" (case-insensitive) is treated as absent.
 * If city is absent, returns "India" as the fallback.
 */
export const formatCenterLocation = (
  city: string | null | undefined,
  state: string | null | undefined,
): string => {
  const isMeaningful = (v: string | null | undefined): v is string =>
    !!v && v.trim() !== "" && v.trim().toUpperCase() !== "TBA"

  if (isMeaningful(city)) {
    return isMeaningful(state) ? `${city.trim()}, ${state.trim()}` : city.trim()
  }
  return "India"
}

const RANGE_UNIT_SCALE: Record<string, number> = { K: 1e3, Mn: 1e6, Bn: 1e9 }

/**
 * Sort key for a bucket label ("<10Mn", "10Mn - 50Mn", ">50Bn", "5K - 10K"):
 * "<X" sorts first, otherwise the first number scaled by its unit. Mirrors
 * rangeOrder in lib/dashboard/entity-query.ts so client and server sorts agree.
 * Returns null for a missing or unparseable label.
 */
export const rangeLowerBound = (label: string | null | undefined): number | null => {
  if (!label) return null
  if (label.trimStart().startsWith("<")) return -1
  const match = label.match(/([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)/)
  if (!match) return null
  return Number(match[1]) * (RANGE_UNIT_SCALE[match[2]] ?? 1)
}

/**
 * Compares two bucket labels by lower bound. Missing values go last in either
 * direction, as they do in the server sort.
 */
export const compareRangeLabels = (
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc" = "asc"
): number => {
  const left = rangeLowerBound(a)
  const right = rangeLowerBound(b)
  if (left === null || right === null) {
    if (left === right) return 0
    return left === null ? 1 : -1
  }
  return direction === "asc" ? left - right : right - left
}
