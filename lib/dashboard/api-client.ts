import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type {
  Account,
  Alias,
  AvailableOptions,
  Center,
  ChartData,
  Filters,
  LockedProspectTeaser,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
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

const postFilters = <T>(path: string, filters: Filters) =>
  request<T>(path, { method: "POST", body: JSON.stringify({ filters }) })

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
  lockedProspectTeasers: LockedProspectTeaser[]
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

export const fetchDashboardSummary = (filters: Filters) => postFilters<SummaryResponse>("/api/dashboard/summary", filters)

export const fetchDashboardFacets = (filters: Filters) => postFilters<FacetsResponse>("/api/dashboard/facets", filters)

export const fetchDashboardCharts = (filters: Filters) => postFilters<ChartsResponse>("/api/dashboard/charts", filters)

export const fetchCentersMap = (filters: Filters) => postFilters<CentersMapResponse>("/api/centers/map", filters)

export function fetchEntityPage<T>(
  entity: "accounts" | "centers" | "prospects",
  filters: Filters,
  page: number,
  pageSize: number,
  sort?: EntitySort | null
): Promise<EntityPage<T>> {
  return request<EntityPage<T>>(`/api/${entity}/query`, {
    method: "POST",
    body: JSON.stringify({ filters, page, pageSize, sort: sort ?? undefined }),
  })
}

export const fetchAccountRelated = (name: string) =>
  request<AccountRelatedResponse>(`/api/accounts/${encodeURIComponent(name)}/related`)

export const fetchCenterDetail = (key: string) =>
  request<CenterDetailResponse>(`/api/centers/${encodeURIComponent(key)}`)

export const fetchProspectById = (id: string) =>
  request<{ prospect: Prospect }>(`/api/prospects/${encodeURIComponent(id)}`)

export const fetchSearch = (query: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`)

export const fetchAccountAutocomplete = (query: string) =>
  request<{ suggestions: AutocompleteSuggestion[] }>(`/api/accounts/autocomplete?q=${encodeURIComponent(query)}`)
