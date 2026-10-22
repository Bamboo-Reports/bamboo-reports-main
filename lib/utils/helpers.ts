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
