import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type {
  Account,
  Alias,
  AvailableOptions,
  Center,
  ChartData,
  Filters,
  Prospect,
  Service,
  Tech,
} from "@/lib/types"

/**
 * Client-side fetchers for the server-backed dashboard endpoints (#249).
 * Every call is bearer-authed with the current Supabase session and returns
 * typed payloads matching the shapes the dashboard components render.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "ApiClientError"
  }
}

async function getAccessToken(): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new ApiClientError("Not authenticated. Please sign in.", 401)
  return token
}

export type FetchOpts = {
  /** Ask the server to skip its response cache (it still repopulates it). */
  noCache?: boolean
}

async function request<T>(path: string, init: RequestInit = {}, opts: FetchOpts = {}): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.noCache ? { "x-no-cache": "1" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  })
  if (!res.ok) {
    let detail = ""
    try {
      detail = ((await res.json()) as { error?: string }).error ?? ""
    } catch {
      detail = ""
    }
    if (res.status === 429) {
      throw new ApiClientError(detail || "Too many requests. Please wait a moment and try again.", 429)
    }
    throw new ApiClientError(detail || `Request failed (${res.status})`, res.status)
  }
  return (await res.json()) as T
}

const postFilters = <T>(path: string, filters: Filters, opts: FetchOpts = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify({ filters }) }, opts)

export type SummaryResponse = {
  filtered: { accounts: number; centers: number; upcomingCenters: number; prospects: number; headcount: number; services: number }
  full: { accounts: number; centers: number; upcomingCenters: number; prospects: number; headcount: number; services: number }
}

export type FacetRanges = {
  revenue: { min: number; max: number }
  yearsInIndia: { min: number; max: number }
  centerIncYear: { min: number; max: number }
}

export type FacetsResponse = { options: AvailableOptions; ranges: FacetRanges }

export type ChartsResponse = {
  account: { regionData: ChartData[]; primaryNatureData: ChartData[]; revenueRangeData: ChartData[]; employeesRangeData: ChartData[] }
  center: { centerTypeData: ChartData[]; employeesRangeData: ChartData[]; cityData: ChartData[]; functionData: ChartData[] }
  prospect: { departmentData: ChartData[]; levelData: ChartData[]; cityData: ChartData[] }
}

export type EntityPage<T> = { rows: T[]; total: number; page: number; pageSize: number }

export type EntitySort = { column: string; direction: "asc" | "desc" }

export type CityAggregate = {
  city: string
  country: string
  lat: number
  lng: number
  count: number
  accountsCount: number
  headcount: number
}

export type StateAggregate = {
  countryIso2: string
  stateKey: string
  countryName: string
  count: number
  accountsCount: number
  headcount: number
}

export type CentersMapResponse = { cities: CityAggregate[]; states: StateAggregate[] }

export type AccountRelatedResponse = {
  account: Account | null
  centers: Center[]
  services: Service[]
  tech: Tech[]
  prospects: Prospect[]
}

export type CenterDetailResponse = { center: Center; services: Service[]; tech: Tech[] }

export type ServerSearchItem = {
  type: "account" | "center" | "prospect"
  id: string
  title: string
  subtitle: string
  data?: Account | Center | Prospect
}

export type SearchResponse = {
  accounts: { items: ServerSearchItem[]; totalMatches: number }
  centers: { items: ServerSearchItem[]; totalMatches: number }
  prospects: { items: ServerSearchItem[]; totalMatches: number }
  total: number
}

export type AutocompleteSuggestion = {
  value: string
  matchedAlias?: { field: keyof Alias; value: string } | null
  visibility?: { visibility: string | null; note: string | null } | null
}

export const fetchDashboardSummary = (filters: Filters, opts: FetchOpts = {}) =>
  postFilters<SummaryResponse>("/api/dashboard/summary", filters, opts)

export const fetchDashboardFacets = (filters: Filters, opts: FetchOpts = {}) =>
  postFilters<FacetsResponse>("/api/dashboard/facets", filters, opts)

export type CoreResponse = { summary: SummaryResponse; facets: FacetsResponse }

/** Summary + facets in one request (the dashboard always needs both). */
export const fetchDashboardCore = (filters: Filters, opts: FetchOpts = {}) =>
  postFilters<CoreResponse>("/api/dashboard/core", filters, opts)

export const fetchDashboardCharts = (filters: Filters, opts: FetchOpts = {}) =>
  postFilters<ChartsResponse>("/api/dashboard/charts", filters, opts)

/** Every chart bucket, uncapped (no top-10 or city "Others" grouping). Used by the summary PDF. */
export const fetchDashboardChartsFull = (filters: Filters, opts: FetchOpts = {}) =>
  request<ChartsResponse>("/api/dashboard/charts", { method: "POST", body: JSON.stringify({ filters, full: true }) }, opts)

export const fetchCentersMap = (filters: Filters, opts: FetchOpts = {}) =>
  postFilters<CentersMapResponse>("/api/centers/map", filters, opts)

export function fetchEntityPage<T>(
  entity: "accounts" | "centers" | "prospects",
  filters: Filters,
  page: number,
  pageSize: number,
  sort?: EntitySort | null,
  opts: FetchOpts = {}
): Promise<EntityPage<T>> {
  return request<EntityPage<T>>(
    `/api/${entity}/query`,
    {
      method: "POST",
      body: JSON.stringify({ filters, page, pageSize, sort: sort ?? undefined }),
    },
    opts
  )
}

// Account detail payloads are reopened constantly (row click, search hit,
// "open account" from a centre or prospect) and can run to 1MB for accounts
// with many prospects, so keep the last few for the session. Shared promise
// so two dialogs opening the same account at once make one request.
const MAX_RELATED_CACHE_ENTRIES = 20
const relatedCache = new Map<string, Promise<AccountRelatedResponse>>()

export function clearAccountRelatedCache(): void {
  relatedCache.clear()
}

export function fetchAccountRelated(name: string, opts: FetchOpts = {}): Promise<AccountRelatedResponse> {
  if (!opts.noCache) {
    const hit = relatedCache.get(name)
    if (hit) return hit
  }
  const pending = request<AccountRelatedResponse>(`/api/accounts/${encodeURIComponent(name)}/related`, {}, opts).catch((err) => {
    relatedCache.delete(name)
    throw err
  })
  relatedCache.delete(name)
  relatedCache.set(name, pending)
  while (relatedCache.size > MAX_RELATED_CACHE_ENTRIES) {
    const oldest = relatedCache.keys().next().value
    if (oldest === undefined) break
    relatedCache.delete(oldest)
  }
  return pending
}

export const fetchCenterDetail = (key: string) =>
  request<CenterDetailResponse>(`/api/centers/${encodeURIComponent(key)}`)

export const fetchProspectById = (id: string) =>
  request<{ prospect: Prospect }>(`/api/prospects/${encodeURIComponent(id)}`)

export const fetchSearch = (query: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`)

export const fetchAccountAutocomplete = (query: string) =>
  request<{ suggestions: AutocompleteSuggestion[] }>(`/api/accounts/autocomplete?q=${encodeURIComponent(query)}`)
