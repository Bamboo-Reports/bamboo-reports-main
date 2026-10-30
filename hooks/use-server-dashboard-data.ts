"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  isCancelledError,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import { devError } from "@/lib/utils/dev-log"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { sanitizeFilters } from "@/lib/config/filters"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getQueryClient } from "@/lib/query-client"
import {
  fetchCentersMap,
  fetchDashboardCharts,
  fetchDashboardFacets,
  fetchDashboardSummary,
  fetchEntityPage,
  isAbortError,
  type EntityPage,
  type EntitySort,
  type FacetRanges,
} from "@/lib/dashboard/api-client"
import type { Account, Center, Filters, Prospect } from "@/lib/types"

const WIDE_RANGE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

/**
 * Ranges that still span the known base range (or an unknown one) are "not
 * narrowed": send them wide so results do not depend on when the base ranges
 * loaded. Narrowed ranges pass through unchanged.
 */
export function normalizeFiltersForServer(filters: Filters, ranges: FacetRanges | null): Filters {
  const norm = (value: [number, number], base: { min: number; max: number } | undefined): [number, number] =>
    !base || (value[0] <= base.min && value[1] >= base.max) ? WIDE_RANGE : value
  return sanitizeFilters({
    ...filters,
    accountHqRevenueRange: norm(filters.accountHqRevenueRange, ranges?.revenue),
    accountYearsInIndiaRange: norm(filters.accountYearsInIndiaRange, ranges?.yearsInIndia),
    centerIncYearRange: norm(filters.centerIncYearRange, ranges?.centerIncYear),
  })
}

// ============================================
// Queries (#249 perf)
// ============================================
// Every response depends only on the canonical wire filters (the "state
// key"), so each is cached per state key in the TanStack Query cache.
// Filter states are revisited constantly (apply -> look -> remove), and a
// revisited state restores instantly with zero network calls.

type Entity = "accounts" | "centers" | "prospects"

const DASHBOARD_KEY = ["dashboard"] as const

const DEBOUNCE_MS = 350
const PREFETCH_DELAY_MS = 400

// Automatic retries for the map colour-scale request after a failure (#291).
// Once these are used up, a refresh or showing the map again retries it.
const SCALE_RETRY_DELAYS_MS = [5_000, 15_000, 45_000]

// reload() briefly bypasses the server-side response cache so "refresh"
// actually recomputes from the warehouse. One window for the app (there is
// one dashboard); read at fetch time.
let bypassUntil = 0
const noCache = () => Date.now() < bypassUntil

const wireOf = (stateKey: string) => JSON.parse(stateKey) as Filters
const sortKeyOf = (sort: EntitySort | null) => (sort ? `${sort.column}:${sort.direction}` : "")

const summaryQuery = (stateKey: string) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "summary", stateKey],
    queryFn: ({ signal }) => fetchDashboardSummary(wireOf(stateKey), { noCache: noCache(), signal }),
  })

const facetsQuery = (stateKey: string) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "facets", stateKey],
    queryFn: ({ signal }) => fetchDashboardFacets(wireOf(stateKey), { noCache: noCache(), signal }),
  })

const chartsQuery = (stateKey: string) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "charts", stateKey],
    queryFn: ({ signal }) => fetchDashboardCharts(wireOf(stateKey), { noCache: noCache(), signal }),
  })

const mapQuery = (stateKey: string) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "map", stateKey],
    queryFn: ({ signal }) => fetchCentersMap(wireOf(stateKey), { noCache: noCache(), signal }),
  })

type PageParams = { stateKey: string; page: number; sort: EntitySort | null }

const pageQuery = (entity: Entity, { stateKey, page, sort }: PageParams, pageSize: number) =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "page", entity, stateKey, pageSize, page, sortKeyOf(sort)],
    queryFn: ({ signal }) =>
      fetchEntityPage<Record<string, unknown>>(entity, wireOf(stateKey), page, pageSize, sort, { noCache: noCache(), signal }),
  })

/** Unfiltered state aggregates for the choropleth colour scale. */
const scaleQuery = () =>
  queryOptions({
    queryKey: [...DASHBOARD_KEY, "scale"],
    queryFn: ({ signal }) =>
      fetchCentersMap(
        createDefaultFilters({
          accountVisibilityMode: "all",
          accountHqRevenueRange: WIDE_RANGE,
          accountYearsInIndiaRange: WIDE_RANGE,
          centerIncYearRange: WIDE_RANGE,
        }),
        { signal }
      ),
    retry: SCALE_RETRY_DELAYS_MS.length,
    retryDelay: (failureCount) => SCALE_RETRY_DELAYS_MS[failureCount] ?? SCALE_RETRY_DELAYS_MS[SCALE_RETRY_DELAYS_MS.length - 1],
  })

/** The state key a dashboard query belongs to; null for the unfiltered scale query. */
function stateKeyOf(queryKey: QueryKey): string | null {
  if (queryKey[0] !== DASHBOARD_KEY[0]) return null
  if (queryKey[1] === "page") return queryKey[3] as string
  if (queryKey[1] === "scale") return null
  return queryKey[2] as string
}

const isLoadedScale = (queryKey: QueryKey, data: unknown) => queryKey[0] === DASHBOARD_KEY[0] && queryKey[1] === "scale" && data !== undefined

/**
 * Marks every cached response stale: visible ones refetch now (keeping their
 * data on screen), the rest on next use. A loaded colour scale is kept, as it
 * is unfiltered; a failed one retries. Record lookups refetch on next open.
 */
export function clearClientDashboardCache(client: QueryClient = getQueryClient()): Promise<void> {
  return client.invalidateQueries({ predicate: (q) => !isLoadedScale(q.queryKey, q.state.data) })
}

/**
 * The value, or the last one seen: a failure, a new key or a refresh keeps
 * the previous result on screen instead of blanking it.
 */
function useLastValue<T>(value: T | undefined): T | null {
  const [last, setLast] = useState<T | null>(null)
  useEffect(() => {
    if (value !== undefined) setLast(value)
  }, [value])
  return value ?? last
}

/**
 * Reports a query's failure once, while its piece is visible. Cancelled
 * requests (#293) revert instead of failing, so they never report.
 */
function useReportFailure(
  query: { error: Error | null; errorUpdatedAt: number },
  id: string,
  active: boolean,
  onFailure: (message: string, id: string) => void
) {
  const { error, errorUpdatedAt } = query
  const reportedRef = useRef("")
  useEffect(() => {
    if (!active || !error || isAbortError(error) || isCancelledError(error)) return
    const token = `${id}@${errorUpdatedAt}`
    if (reportedRef.current === token) return
    reportedRef.current = token
    onFailure(error.message, id)
  }, [active, error, errorUpdatedAt, id, onFailure])
}

export type EntityPages = {
  accounts: EntityPage<Account> | null
  centers: EntityPage<Center> | null
  prospects: EntityPage<Prospect> | null
}

export type DashboardViews = {
  /** A chart view is currently visible (charts fetch lazily). */
  needCharts: boolean
  /** A map view is currently visible (map aggregates fetch lazily). */
  needMap: boolean
  /** The active section; only its rows page is fetched. */
  activeEntity: Entity
}

interface UseServerDashboardDataParams {
  enabled: boolean
  filters: Filters
  pages: { accounts: number; centers: number; prospects: number }
  sorts: { accounts: EntitySort | null; centers: EntitySort | null; prospects: EntitySort | null }
  pageSize: number
  views: DashboardViews
}

/**
 * Server-backed dashboard data (#249): everything the dashboard renders,
 * sourced from the aggregated/paginated endpoints through TanStack Query.
 * Filter changes are debounced and each response is cached per canonical
 * filter state, so revisited states (e.g. removing a filter) restore
 * instantly. The visible view fetches first; charts, map aggregates, and the
 * inactive tabs' pages prefetch in the background shortly after, so view
 * switches hit the cache.
 */
export function useServerDashboardData({ enabled, filters, pages, sorts, pageSize, views }: UseServerDashboardDataParams) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  // The latest failure of any piece. Unlike `error`, a later success does not
  // clear it, and `seq` changes on every failure so the UI can notify again
  // even when the message repeats (e.g. two 504s in a row).
  const [failure, setFailure] = useState<{ message: string; seq: number } | null>(null)
  // Stays true for the whole reload() round trip so the header can show the
  // refresh running: a refresh keeps the filters, and the data on screen, so
  // the per-section pending cues never trigger.
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // The canonical (wire) filters JSON driving all queries; updates are
  // debounced unless the target state is already cached.
  const [effectiveKey, setEffectiveKey] = useState("")
  // The filters (filtersKey) that effectiveKey was last brought up to date
  // with. While they differ from the current filters, a change is waiting out
  // the debounce and table pages hold off: the dashboard resets them to page 1
  // on a filter change, which would otherwise show or fetch page 1 for the old
  // filters (#289). Compared during render, so it holds from the first render
  // of the change.
  const [settledFiltersKey, setSettledFiltersKey] = useState<string | null>(null)

  // Latest-value refs are assigned in a layout effect (never during render) so
  // they are current before any passive effect below reads them.
  const filtersRef = useRef(filters)
  useLayoutEffect(() => {
    filtersRef.current = filters
  }, [filters])
  const filtersKey = useMemo(() => JSON.stringify(sanitizeFilters(filters)), [filters])

  const reportError = useCallback((message: string) => {
    setError(message)
    setFailure((prev) => ({ message, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  const hasState = enabled && !!effectiveKey

  // Summary + facets: always needed (cards + sidebar are always visible). Two
  // parallel queries, applied independently: the summary is a handful of
  // count statements and lands well before the facets (23 grouped lists in
  // one statement), so the cards update first.
  const summaryQ = useQuery({ ...summaryQuery(effectiveKey), enabled: hasState })
  const facetsQ = useQuery({ ...facetsQuery(effectiveKey), enabled: hasState })
  // Charts and map aggregates: only while their view is visible.
  const chartsQ = useQuery({ ...chartsQuery(effectiveKey), enabled: hasState && views.needCharts })
  const mapQ = useQuery({ ...mapQuery(effectiveKey), enabled: hasState && views.needMap })
  // The colour scale: once a map has been shown, retried after a failure (#291).
  const scaleQ = useQuery({ ...scaleQuery(), enabled: enabled && views.needMap })

  // Base ranges are read through a ref inside effects so a facets update does
  // not itself retrigger the debounce (the normalized filters only change if
  // the user actually narrowed a range).
  const rangesRef = useRef<FacetRanges | null>(null)
  const facetsData = facetsQ.data
  useEffect(() => {
    if (facetsData) rangesRef.current = facetsData.ranges
  }, [facetsData])

  // Debounced application of filter changes. Cached states apply immediately
  // (removing a filter snaps back); unseen states coalesce rapid clicks.
  useEffect(() => {
    if (!enabled) return
    const key = JSON.stringify(normalizeFiltersForServer(filtersRef.current, rangesRef.current))
    if (key === effectiveKey) {
      setSettledFiltersKey(filtersKey)
      return
    }
    const cached =
      queryClient.getQueryData(summaryQuery(key).queryKey) !== undefined &&
      queryClient.getQueryData(facetsQuery(key).queryKey) !== undefined
    if (!effectiveKey || cached) {
      setEffectiveKey(key)
      setSettledFiltersKey(filtersKey)
      return
    }
    const timer = setTimeout(() => {
      setEffectiveKey(key)
      setSettledFiltersKey(filtersKey)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, filtersKey, effectiveKey, queryClient])

  // Moving to a new filter state cancels every request still in flight for
  // the previous one, prefetches included, so rapid filtering does not keep
  // the server computing states nobody will see (#293). TanStack Query
  // cancels a query as soon as its observer's key moves on, which covers the
  // visible queries and the prefetches (each has an observer, if disabled,
  // on the same key); this also cancels any old-state request without one.
  // Cancelled queries revert rather than fail, so nothing is reported.
  useEffect(() => {
    if (!effectiveKey) return
    void queryClient.cancelQueries({
      predicate: (q) => {
        const stateKey = stateKeyOf(q.queryKey)
        return stateKey !== null && stateKey !== effectiveKey
      },
    })
  }, [effectiveKey, queryClient])
  useEffect(() => {
    return () => {
      void queryClient.cancelQueries({ queryKey: DASHBOARD_KEY })
    }
  }, [queryClient])

  // Per-entity paginated rows: only the active section fetches; the others
  // fetch on first activation (or come from the prefetch). Each table is its
  // own query, so a page, sort or filter change cancels only that table's
  // previous request (#293). While a filter change is debouncing, a table
  // keeps its last settled page (#289) instead of page 1 for the old filters.
  const filtersSettled = settledFiltersKey === filtersKey
  const liveParams: Record<Entity, PageParams> = {
    accounts: { stateKey: effectiveKey, page: pages.accounts, sort: sorts.accounts },
    centers: { stateKey: effectiveKey, page: pages.centers, sort: sorts.centers },
    prospects: { stateKey: effectiveKey, page: pages.prospects, sort: sorts.prospects },
  }
  const [settledParams, setSettledParams] = useState<Record<Entity, PageParams> | null>(null)
  const liveParamsKey = JSON.stringify(liveParams)
  useEffect(() => {
    if (filtersSettled) setSettledParams(JSON.parse(liveParamsKey) as Record<Entity, PageParams>)
  }, [filtersSettled, liveParamsKey])
  const paramsFor = (entity: Entity) => (filtersSettled || !settledParams ? liveParams[entity] : settledParams[entity])
  const pageEnabled = (entity: Entity) => hasState && filtersSettled && views.activeEntity === entity
  const accountsQ = useQuery({ ...pageQuery("accounts", paramsFor("accounts"), pageSize), enabled: pageEnabled("accounts") })
  const centersQ = useQuery({ ...pageQuery("centers", paramsFor("centers"), pageSize), enabled: pageEnabled("centers") })
  const prospectsQ = useQuery({ ...pageQuery("prospects", paramsFor("prospects"), pageSize), enabled: pageEnabled("prospects") })

  // Background prefetch: ~400ms after a new filter state settles (visible
  // requests go out first), quietly warm the cache with whatever the visible
  // queries are not already fetching: charts, map aggregates, and the
  // inactive tabs' pages. View/tab switches then hit the cache and feel
  // instant. Failures are only logged; a view shown later fetches again.
  const viewsRef = useRef(views)
  const pagesRef = useRef(pages)
  const sortsRef = useRef(sorts)
  useLayoutEffect(() => {
    viewsRef.current = views
    pagesRef.current = pages
    sortsRef.current = sorts
  }, [views, pages, sorts])
  useEffect(() => {
    if (!hasState) return
    const timer = setTimeout(() => {
      const logFailure = (what: string) => (err: unknown) => {
        if (!isAbortError(err) && !isCancelledError(err)) devError(`${what} prefetch failed:`, err)
      }
      if (!viewsRef.current.needCharts) {
        queryClient.fetchQuery(chartsQuery(effectiveKey)).catch(logFailure("charts"))
      }
      if (!viewsRef.current.needMap) {
        queryClient.fetchQuery(mapQuery(effectiveKey)).catch(logFailure("map"))
      }
      for (const entity of ["accounts", "centers", "prospects"] as const) {
        if (viewsRef.current.activeEntity === entity) continue
        const params = { stateKey: effectiveKey, page: pagesRef.current[entity], sort: sortsRef.current[entity] }
        queryClient.fetchQuery(pageQuery(entity, params, pageSize)).catch(logFailure(`${entity} page`))
      }
    }, PREFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [hasState, effectiveKey, refreshKey, pageSize, queryClient])

  // Failures: reported once each, while the piece is visible. A failed piece
  // keeps its previous data on screen and stops its pending cue.
  const reportCoreFailure = useCallback(
    (message: string) => {
      devError("dashboard summary/facets fetch failed:", message)
      reportError(message)
      captureEvent(ANALYTICS_EVENTS.DATA_LOAD_FAILED, { error_message: message })
    },
    [reportError]
  )
  const reportPieceFailure = useCallback(
    (message: string, id: string) => {
      devError(`${id} fetch failed:`, message)
      reportError(message)
    },
    [reportError]
  )
  useReportFailure(summaryQ, `summary:${effectiveKey}`, hasState, reportCoreFailure)
  useReportFailure(facetsQ, `facets:${effectiveKey}`, hasState, reportCoreFailure)
  useReportFailure(chartsQ, `charts:${effectiveKey}`, hasState && views.needCharts, reportPieceFailure)
  useReportFailure(mapQ, `map:${effectiveKey}`, hasState && views.needMap, reportPieceFailure)
  useReportFailure(accountsQ, `accounts:${JSON.stringify(paramsFor("accounts"))}`, pageEnabled("accounts"), reportPieceFailure)
  useReportFailure(centersQ, `centers:${JSON.stringify(paramsFor("centers"))}`, pageEnabled("centers"), reportPieceFailure)
  useReportFailure(prospectsQ, `prospects:${JSON.stringify(paramsFor("prospects"))}`, pageEnabled("prospects"), reportPieceFailure)

  // A successful summary + facets load clears the error, and a load that
  // actually went to the network (not a cache hit) is measured.
  const coreFetching = hasState && (summaryQ.isFetching || facetsQ.isFetching)
  const coreSucceeded = hasState && summaryQ.isSuccess && facetsQ.isSuccess
  const coreLoadRef = useRef<{ key: string; startedAt: number } | null>(null)
  useEffect(() => {
    if (coreFetching) {
      if (coreLoadRef.current?.key !== effectiveKey) coreLoadRef.current = { key: effectiveKey, startedAt: Date.now() }
      return
    }
    const load = coreLoadRef.current
    coreLoadRef.current = null
    if (!coreSucceeded) return
    setError(null)
    if (load?.key === effectiveKey) {
      captureEvent(ANALYTICS_EVENTS.DATA_LOAD_SUCCEEDED, { duration_ms: Date.now() - load.startedAt, is_refresh: noCache() })
    }
  }, [coreFetching, coreSucceeded, effectiveKey])

  const reload = useCallback(() => {
    bypassUntil = Date.now() + 5000
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
    void clearClientDashboardCache(queryClient).finally(() => setIsRefreshing(false))
  }, [queryClient])

  const summary = useLastValue(summaryQ.data)
  const facets = useLastValue(facetsQ.data)
  const charts = useLastValue(chartsQ.data)
  const map = useLastValue(mapQ.data)
  const accountsPage = useLastValue(accountsQ.data)
  const centersPage = useLastValue(centersQ.data)
  const prospectsPage = useLastValue(prospectsQ.data)
  const scaleStates = scaleQ.data?.states ?? null

  const entityPages = useMemo<EntityPages>(
    () => ({
      accounts: accountsPage as EntityPage<Account> | null,
      centers: centersPage as EntityPage<Center> | null,
      prospects: prospectsPage as EntityPage<Prospect> | null,
    }),
    [accountsPage, centersPage, prospectsPage]
  )

  const initialLoading = enabled && summary === null && error === null

  // "Showing a previous state while the current one loads" per piece. Cached
  // states apply synchronously, so revisited states never flash a pending cue.
  const stale = (q: { data: unknown; isError: boolean }) => hasState && q.data === undefined && !q.isError
  const pageStale = (entity: Entity, q: { data: unknown; isError: boolean }) =>
    stale(q) || (hasState && !filtersSettled && JSON.stringify(liveParams[entity]) !== JSON.stringify(paramsFor(entity)))
  const pending = {
    /** Cards: only the summary counts. */
    summary: stale(summaryQ),
    /** Sidebar option lists. */
    facets: stale(facetsQ),
    /** Either of the always-visible pieces. */
    core: stale(summaryQ) || stale(facetsQ),
    charts: stale(chartsQ),
    map: stale(mapQ),
    accounts: pageStale("accounts", accountsQ),
    centers: pageStale("centers", centersQ),
    prospects: pageStale("prospects", prospectsQ),
  }

  return {
    summary,
    facets,
    charts,
    map,
    scaleStates,
    entityPages,
    error,
    failure,
    isFetching: coreFetching,
    isRefreshing,
    initialLoading,
    pending,
    reload,
  }
}
