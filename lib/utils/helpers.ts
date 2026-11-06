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

const REVENUE_AMOUNT = /^(\d+(?:\.\d+)?)\s*(Mn|Bn|M|B)$/i

const revenueAmount = (part: string): string | null => {
  const match = part.trim().match(REVENUE_AMOUNT)
  return match ? `$${match[1]}${match[2][0].toUpperCase()}` : null
}

/**
 * A stored revenue range ("10Mn - 50Mn", "<10Mn", ">50Bn") in the form the
 * revenue filter uses: "$10M to $50M", "Under $10M", "$50B+". Anything else
 * is returned as it is.
 */
export const formatRevenueRange = (raw: string | null | undefined): string => {
  const text = raw?.trim() ?? ""
  if (text.startsWith("<")) {
    const amount = revenueAmount(text.slice(1))
    return amount ? `Under ${amount}` : text
  }
  if (text.startsWith(">")) {
    const amount = revenueAmount(text.slice(1))
    return amount ? `${amount}+` : text
  }
  const parts = text.split(/\s*-\s*/)
  if (parts.length === 2) {
    const [from, to] = parts.map(revenueAmount)
    if (from && to) return `${from} to ${to}`
  }
  return text
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

/** "1 account", "2,400 accounts". */
export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`
