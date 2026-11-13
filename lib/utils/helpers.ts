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
export const getPaginatedData = <T,>(data: T[], page: number, itemsPerPage: number): T[] => {
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

/** A trimmed value, or null when it is blank or the "TBA" placeholder. */
export const knownText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed && trimmed.toUpperCase() !== "TBA" ? trimmed : null
}

/**
 * Where a centre, prospect or account HQ is, as one place: the city when
 * known, else the state, else the country, else `fallback`. Blank and "TBA"
 * count as unknown at every level.
 */
export const formatLocation = (
  city: string | null | undefined,
  state: string | null | undefined,
  country?: string | null | undefined,
  fallback = "India",
): string => knownText(city) ?? knownText(state) ?? knownText(country) ?? fallback

/** An account's HQ location. With nothing known it is blank, not "India". */
export const formatAccountLocation = (
  account: { account_hq_city?: string | null; account_hq_state?: string | null; account_hq_country?: string | null },
): string => formatLocation(account.account_hq_city, account.account_hq_state, account.account_hq_country, "")

export const formatProspectLocation = formatLocation
export const formatCenterLocation = formatLocation

/** "1 account", "2,400 accounts". */
export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`
