"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { devError } from "@/lib/utils/dev-log"
import { sanitizeFilters } from "@/lib/config/filters"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import {
  fetchCentersMap,
  fetchDashboardCharts,
  fetchDashboardFacets,
  fetchDashboardSummary,
  fetchEntityPage,
  type CentersMapResponse,
  type ChartsResponse,
  type EntityPage,
  type EntitySort,
  type FacetRanges,
  type FacetsResponse,
  type StateAggregate,
  type SummaryResponse,
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
// Client-side response cache (#249 perf)
// ============================================
// Filter states are revisited constantly (apply -> look -> remove), and every
// response depends only on the canonical wire filters, so previously seen
// states restore instantly with zero network calls. Session lifetime,
// LRU-bounded; reload() clears it for a forced refresh.

const MAX_CLIENT_CACHE_ENTRIES = 40

function lruSet<V>(cache: Map<string, V>, key: string, value: V): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > MAX_CLIENT_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

const summaryCache = new Map<string, SummaryResponse>()
const facetsCache = new Map<string, FacetsResponse>()
const chartsCache = new Map<string, ChartsResponse>()
const mapCache = new Map<string, CentersMapResponse>()
const pageCache = new Map<string, EntityPage<Record<string, unknown>>>()

export function clearClientDashboardCache(): void {
  summaryCache.clear()
  facetsCache.clear()
  chartsCache.clear()
  mapCache.clear()
  pageCache.clear()
}

const DEBOUNCE_MS = 350

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
  activeEntity: "accounts" | "centers" | "prospects"
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
 * sourced from the aggregated/paginated endpoints. Filter changes are
 * debounced and each response is cached per canonical filter state, so
 * revisited states (e.g. removing a filter) restore instantly. The visible
 * view fetches first; charts, map aggregates, and the inactive tabs' pages
 * prefetch in the background shortly after, so view switches hit the cache.
 */
export function useServerDashboardData({ enabled, filters, pages, sorts, pageSize, views }: UseServerDashboardDataParams) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [facets, setFacets] = useState<FacetsResponse | null>(null)
  const [charts, setCharts] = useState<ChartsResponse | null>(null)
  const [map, setMap] = useState<CentersMapResponse | null>(null)
  const [scaleStates, setScaleStates] = useState<StateAggregate[] | null>(null)
  const [entityPages, setEntityPages] = useState<EntityPages>({ accounts: null, centers: null, prospects: null })
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // The canonical (wire) filters JSON driving all fetches; updates are
  // debounced unless the target state is already cached.
  const [effectiveKey, setEffectiveKey] = useState("")
  // The key each piece of state was last applied for, so the UI can tell
  // "showing the previous state while a newer one loads" (pending flags).
  const [appliedKeys, setAppliedKeys] = useState<{
    core: string
    charts: string
    map: string
    pages: { accounts: string; centers: string; prospects: string }
  }>({ core: "", charts: "", map: "", pages: { accounts: "", centers: "", prospects: "" } })

  // Base ranges are read through a ref inside effects so a facets update does
  // not itself retrigger the fetch effects (the normalized filters only change
  // if the user actually narrowed a range).
  const rangesRef = useRef<FacetRanges | null>(null)
  useEffect(() => {
    rangesRef.current = facets?.ranges ?? null
  }, [facets])

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const filtersKey = useMemo(() => JSON.stringify(sanitizeFilters(filters)), [filters])

  // reload() clears the caches and briefly bypasses the server-side response
  // cache so "refresh" actually recomputes from the warehouse.
  const bypassUntilRef = useRef(0)
  const noCache = () => Date.now() < bypassUntilRef.current
  const reload = useCallback(() => {
    clearClientDashboardCache()
    bypassUntilRef.current = Date.now() + 5000
    setRefreshKey((k) => k + 1)
  }, [])

  const coreRequestRef = useRef(0)
  const chartsRequestRef = useRef(0)
  const mapRequestRef = useRef(0)
  const entityRequestRef = useRef({ accounts: 0, centers: 0, prospects: 0 })

  // Debounced application of filter changes. Cached states apply immediately
  // (removing a filter snaps back); unseen states coalesce rapid clicks.
  useEffect(() => {
    if (!enabled) return
    const key = JSON.stringify(normalizeFiltersForServer(filtersRef.current, rangesRef.current))
    if (key === effectiveKey) return
    if (!effectiveKey || (summaryCache.has(key) && facetsCache.has(key))) {
      setEffectiveKey(key)
      return
    }
    const timer = setTimeout(() => setEffectiveKey(key), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, filtersKey, effectiveKey])

  // Summary + facets: always needed (cards + sidebar are always visible).
  useEffect(() => {
    if (!enabled || !effectiveKey) return
    const cachedSummary = summaryCache.get(effectiveKey)
    const cachedFacets = facetsCache.get(effectiveKey)
    if (cachedSummary && cachedFacets) {
      setSummary(cachedSummary)
      setFacets(cachedFacets)
      setAppliedKeys((prev) => ({ ...prev, core: effectiveKey }))
      setError(null)
      return
    }
    const requestId = ++coreRequestRef.current
    const wireFilters = JSON.parse(effectiveKey) as Filters
    setIsFetching(true)
    Promise.all([
      fetchDashboardSummary(wireFilters, { noCache: noCache() }),
      fetchDashboardFacets(wireFilters, { noCache: noCache() }),
    ])
      .then(([summaryRes, facetsRes]) => {
        if (coreRequestRef.current !== requestId) return
        lruSet(summaryCache, effectiveKey, summaryRes)
        lruSet(facetsCache, effectiveKey, facetsRes)
        setSummary(summaryRes)
        setFacets(facetsRes)
        setAppliedKeys((prev) => ({ ...prev, core: effectiveKey }))
        setError(null)
      })
      .catch((err) => {
        if (coreRequestRef.current !== requestId) return
        devError("dashboard summary/facets fetch failed:", err)
        setError(err instanceof Error ? err.message : "Failed to load dashboard data")
      })
      .finally(() => {
        if (coreRequestRef.current === requestId) setIsFetching(false)
      })
  }, [enabled, effectiveKey, refreshKey])

  // Charts: only when a chart view is visible.
  useEffect(() => {
    if (!enabled || !effectiveKey || !views.needCharts) return
    const cached = chartsCache.get(effectiveKey)
    if (cached) {
      setCharts(cached)
      setAppliedKeys((prev) => ({ ...prev, charts: effectiveKey }))
      return
    }
    const requestId = ++chartsRequestRef.current
    fetchDashboardCharts(JSON.parse(effectiveKey) as Filters, { noCache: noCache() })
      .then((res) => {
        if (chartsRequestRef.current !== requestId) return
        lruSet(chartsCache, effectiveKey, res)
        setCharts(res)
        setAppliedKeys((prev) => ({ ...prev, charts: effectiveKey }))
      })
      .catch((err) => devError("dashboard charts fetch failed:", err))
  }, [enabled, effectiveKey, views.needCharts, refreshKey])

  // Map aggregates: only when a map view is visible.
  useEffect(() => {
    if (!enabled || !effectiveKey || !views.needMap) return
    const cached = mapCache.get(effectiveKey)
    if (cached) {
      setMap(cached)
      setAppliedKeys((prev) => ({ ...prev, map: effectiveKey }))
      return
    }
    const requestId = ++mapRequestRef.current
    fetchCentersMap(JSON.parse(effectiveKey) as Filters, { noCache: noCache() })
      .then((res) => {
        if (mapRequestRef.current !== requestId) return
        lruSet(mapCache, effectiveKey, res)
        setMap(res)
        setAppliedKeys((prev) => ({ ...prev, map: effectiveKey }))
      })
      .catch((err) => devError("centers map fetch failed:", err))
  }, [enabled, effectiveKey, views.needMap, refreshKey])

  // Background prefetch: ~400ms after a new filter state settles (visible
  // requests go out first), quietly warm the client cache with whatever the
  // lazy effects are not already fetching: charts, map aggregates, and the
  // inactive tabs' pages. View/tab switches then hit the cache and feel
  // instant. Fire-and-forget cache writes only; the lazy effects own state.
  const viewsRef = useRef(views)
  viewsRef.current = views
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const sortsRef = useRef(sorts)
  sortsRef.current = sorts
  useEffect(() => {
    if (!enabled || !effectiveKey) return
    const timer = setTimeout(() => {
      const wireFilters = JSON.parse(effectiveKey) as Filters
      const bypass = { noCache: noCache() }

      if (!viewsRef.current.needCharts && !chartsCache.has(effectiveKey)) {
        fetchDashboardCharts(wireFilters, bypass)
          .then((res) => lruSet(chartsCache, effectiveKey, res))
          .catch((err) => devError("charts prefetch failed:", err))
      }
      if (!viewsRef.current.needMap && !mapCache.has(effectiveKey)) {
        fetchCentersMap(wireFilters, bypass)
          .then((res) => lruSet(mapCache, effectiveKey, res))
          .catch((err) => devError("map prefetch failed:", err))
      }
      for (const entity of ["accounts", "centers", "prospects"] as const) {
        if (viewsRef.current.activeEntity === entity) continue
        const sort = sortsRef.current[entity]
        const sortKey = sort ? `${sort.column}:${sort.direction}` : ""
        const cacheKey = `${entity}:${effectiveKey}:${pagesRef.current[entity]}:${sortKey}`
        if (pageCache.has(cacheKey)) continue
        fetchEntityPage(entity, wireFilters, pagesRef.current[entity], pageSize, sort, bypass)
          .then((res) => lruSet(pageCache, cacheKey, res as EntityPage<Record<string, unknown>>))
          .catch((err) => devError(`${entity} page prefetch failed:`, err))
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, effectiveKey, refreshKey])

  // Unfiltered state aggregates for the choropleth color scale (once, and only
  // once a map has been shown).
  useEffect(() => {
    if (!enabled || !views.needMap || scaleStates !== null) return
    let cancelled = false
    fetchCentersMap(
      createDefaultFilters({
        accountVisibilityMode: "all",
        accountHqRevenueRange: WIDE_RANGE,
        accountYearsInIndiaRange: WIDE_RANGE,
        centerIncYearRange: WIDE_RANGE,
      })
    )
      .then((res) => {
        if (!cancelled) setScaleStates(res.states)
      })
      .catch((err) => devError("scale aggregates fetch failed:", err))
    return () => {
      cancelled = true
    }
  }, [enabled, views.needMap, scaleStates])

  // Per-entity paginated rows: only the active section fetches; the others
  // fetch on first activation (and then hit the cache).
  const useEntityEffect = (entity: "accounts" | "centers" | "prospects", page: number, sort: EntitySort | null) => {
    const sortKey = sort ? `${sort.column}:${sort.direction}` : ""
    const active = views.activeEntity === entity
    useEffect(() => {
      if (!enabled || !effectiveKey || !active) return
      const cacheKey = `${entity}:${effectiveKey}:${page}:${sortKey}`
      const cached = pageCache.get(cacheKey)
      if (cached) {
        setEntityPages((prev) => ({ ...prev, [entity]: cached }))
        setAppliedKeys((prev) => ({ ...prev, pages: { ...prev.pages, [entity]: cacheKey } }))
        return
      }
      const requestId = ++entityRequestRef.current[entity]
      const wireFilters = JSON.parse(effectiveKey) as Filters
      fetchEntityPage(entity, wireFilters, page, pageSize, sort, { noCache: noCache() })
        .then((res) => {
          if (entityRequestRef.current[entity] !== requestId) return
          lruSet(pageCache, cacheKey, res as EntityPage<Record<string, unknown>>)
          setEntityPages((prev) => ({ ...prev, [entity]: res }))
          setAppliedKeys((prev) => ({ ...prev, pages: { ...prev.pages, [entity]: cacheKey } }))
        })
        .catch((err) => {
          if (entityRequestRef.current[entity] !== requestId) return
          devError(`${entity} page fetch failed:`, err)
          setError(err instanceof Error ? err.message : `Failed to load ${entity}`)
        })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, effectiveKey, active, page, sortKey, refreshKey])
  }
  /* eslint-disable react-hooks/rules-of-hooks -- fixed call order: the three entities are static */
  useEntityEffect("accounts", pages.accounts, sorts.accounts)
  useEntityEffect("centers", pages.centers, sorts.centers)
  useEntityEffect("prospects", pages.prospects, sorts.prospects)
  /* eslint-enable react-hooks/rules-of-hooks */

  const initialLoading = enabled && summary === null && error === null

  // "Showing a previous state while the current one loads" per piece. Cache
  // hits apply synchronously, so revisited states never flash a pending cue.
  const pending = useMemo(() => {
    const pageKeyFor = (entity: "accounts" | "centers" | "prospects") => {
      const sort = sorts[entity]
      return `${entity}:${effectiveKey}:${pages[entity]}:${sort ? `${sort.column}:${sort.direction}` : ""}`
    }
    const stale = (applied: string, target: string) => enabled && !!effectiveKey && applied !== target
    return {
      core: stale(appliedKeys.core, effectiveKey),
      charts: stale(appliedKeys.charts, effectiveKey),
      map: stale(appliedKeys.map, effectiveKey),
      accounts: stale(appliedKeys.pages.accounts, pageKeyFor("accounts")),
      centers: stale(appliedKeys.pages.centers, pageKeyFor("centers")),
      prospects: stale(appliedKeys.pages.prospects, pageKeyFor("prospects")),
    }
  }, [enabled, effectiveKey, appliedKeys, pages, sorts])

  return {
    summary,
    facets,
    charts,
    map,
    scaleStates,
    entityPages,
    error,
    isFetching,
    initialLoading,
    pending,
    reload,
  }
}
