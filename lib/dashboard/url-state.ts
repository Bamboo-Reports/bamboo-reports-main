import type { Filters, FilterValue } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

/**
 * The dashboard's filters and view, kept in the address bar so a refresh, the
 * back button or a pasted link brings them back:
 *
 *   /?view=centers&show=data&f=<filters>
 *
 * `view` and `show` are left out at their defaults. `f` holds only the filters
 * that differ from the defaults, as base64url JSON. Ranges at the slider's full
 * extent are defaults. An account list is stored by its id and, while the link
 * stays short enough, the names it expands to, so someone without the list
 * still gets its accounts; a large list is stored by its id alone and the
 * names are re-derived from the list when the filters are restored.
 */

export type UrlSection = "accounts" | "centers" | "prospects"
export type UrlView = "chart" | "data" | "map"

export interface RangeBounds {
  revenue: { min: number; max: number }
  yearsInIndia: { min: number; max: number }
  centerIncYear: { min: number; max: number }
}

export interface DashboardUrlState {
  section: UrlSection
  view: UrlView
  filters: Filters
}

export interface DecodedDashboardUrl {
  section: UrlSection | null
  view: UrlView | null
  /** Only the filters the address set; merge over the defaults to use. */
  filters: Partial<Filters> | null
}

const SECTIONS: UrlSection[] = ["accounts", "centers", "prospects"]
const VIEWS: UrlView[] = ["chart", "data", "map"]
export const DEFAULT_URL_SECTION: UrlSection = "accounts"
/** The view each section opens in. */
export const DEFAULT_URL_VIEWS: Record<UrlSection, UrlView> = { accounts: "map", centers: "map", prospects: "chart" }

const RANGE_KEYS = {
  accountHqRevenueRange: "revenue",
  accountYearsInIndiaRange: "yearsInIndia",
  centerIncYearRange: "centerIncYear",
} as const satisfies Partial<Record<keyof Filters, keyof RangeBounds>>

function baselineFilters(bounds: RangeBounds): Filters {
  return createDefaultFilters({
    accountHqRevenueRange: [bounds.revenue.min, bounds.revenue.max],
    accountYearsInIndiaRange: [bounds.yearsInIndia.min, bounds.yearsInIndia.max],
    centerIncYearRange: [bounds.centerIncYear.min, bounds.centerIncYear.max],
  })
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)))
}

/**
 * Longest `f` value that still carries the account names behind a selected
 * list. Past it the names are left to the list, so a link never grows beyond
 * what browsers, chat tools and proxies accept.
 */
export const MAX_FILTER_PARAM_LENGTH = 1500

/** The filters that differ from the defaults (ranges against the slider bounds). */
export function filtersDiff(
  filters: Filters,
  bounds: RangeBounds,
  { listNames = true }: { listNames?: boolean } = {}
): Partial<Filters> {
  const base = baselineFilters(bounds)
  const diff: Record<string, unknown> = {}
  for (const key of Object.keys(base) as (keyof Filters)[]) {
    const value = filters[key]
    if (value === undefined || sameJson(value, base[key])) continue
    // Names that come from account lists can be rebuilt from the lists on load.
    if (key === "accountNameValues" && !listNames && filters.accountListValues.length > 0) continue
    diff[key] = value
  }
  return diff as Partial<Filters>
}

/** The query string (with "?", or "" when everything is at its default). */
export function encodeDashboardUrl(state: DashboardUrlState, bounds: RangeBounds): string {
  const params = new URLSearchParams()
  if (state.section !== DEFAULT_URL_SECTION) params.set("view", state.section)
  if (state.view !== DEFAULT_URL_VIEWS[state.section]) params.set("show", state.view)
  let diff = filtersDiff(state.filters, bounds)
  let encoded = toBase64Url(JSON.stringify(diff))
  if (encoded.length > MAX_FILTER_PARAM_LENGTH && state.filters.accountListValues.length > 0) {
    diff = filtersDiff(state.filters, bounds, { listNames: false })
    encoded = toBase64Url(JSON.stringify(diff))
  }
  if (Object.keys(diff).length > 0) params.set("f", encoded)
  const query = params.toString()
  return query ? `?${query}` : ""
}

const isFilterValueList = (value: unknown): value is FilterValue[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as FilterValue).value === "string" &&
      ((item as FilterValue).mode === "include" || (item as FilterValue).mode === "exclude")
  )

const isRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n))

/** Keeps only known filter keys whose values have the right shape. */
function sanitizeFilters(raw: unknown): Partial<Filters> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const template = createDefaultFilters()
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Own keys only: "constructor" or "__proto__" in a crafted link must not pass as a filter.
    if (!Object.hasOwn(template, key)) continue
    const expected = template[key as keyof Filters]
    if (Object.hasOwn(RANGE_KEYS, key)) {
      if (isRange(value)) out[key] = value
    } else if (Array.isArray(expected)) {
      if (isFilterValueList(value)) out[key] = value
    } else if (typeof expected === "boolean") {
      if (typeof value === "boolean") out[key] = value
    } else if (key === "accountVisibilityMode") {
      if (value === "all" || value === "gcc" || value === "nonGcc") out[key] = value
    }
  }
  return Object.keys(out).length > 0 ? (out as Partial<Filters>) : null
}

/** Reads the address bar's query string. Anything malformed is ignored. */
export function decodeDashboardUrl(search: string): DecodedDashboardUrl {
  const params = new URLSearchParams(search)
  const rawSection = params.get("view")
  const section = SECTIONS.includes(rawSection as UrlSection) ? (rawSection as UrlSection) : null
  const rawView = params.get("show")
  const view = VIEWS.includes(rawView as UrlView) ? (rawView as UrlView) : null
  let filters: Partial<Filters> | null = null
  const encoded = params.get("f")
  if (encoded) {
    try {
      filters = sanitizeFilters(JSON.parse(fromBase64Url(encoded)))
    } catch {
      filters = null
    }
  }
  return { section, view, filters }
}

/** Decoded filters laid over the defaults for the given slider bounds. */
export function filtersFromUrl(diff: Partial<Filters>, bounds: RangeBounds): Filters {
  return { ...baselineFilters(bounds), ...diff }
}
