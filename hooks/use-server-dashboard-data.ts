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

export type EntityPages = {
  accounts: EntityPage<Account> | null
  centers: EntityPage<Center> | null
  prospects: EntityPage<Prospect> | null
}

interface UseServerDashboardDataParams {
  enabled: boolean
  filters: Filters
  pages: { accounts: number; centers: number; prospects: number }
  sorts: { accounts: EntitySort | null; centers: EntitySort | null; prospects: EntitySort | null }
  pageSize: number
}

/**
 * Server-backed dashboard data (#249): everything the dashboard renders,
 * sourced from the aggregated/paginated endpoints instead of the full
 * /api/dashboard payload. Filter changes refetch; per-entity page/sort changes
 * refetch only that entity's page.
 */
export function useServerDashboardData({ enabled, filters, pages, sorts, pageSize }: UseServerDashboardDataParams) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [facets, setFacets] = useState<FacetsResponse | null>(null)
  const [charts, setCharts] = useState<ChartsResponse | null>(null)
  const [map, setMap] = useState<CentersMapResponse | null>(null)
  const [scaleStates, setScaleStates] = useState<StateAggregate[] | null>(null)
  const [entityPages, setEntityPages] = useState<EntityPages>({ accounts: null, centers: null, prospects: null })
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Base ranges are read through a ref inside effects so a facets update does
  // not itself retrigger the fetch effects (the normalized filters only change
  // if the user actually narrowed a range).
  const rangesRef = useRef<FacetRanges | null>(null)
  useEffect(() => {
    rangesRef.current = facets?.ranges ?? null
  }, [facets])

  const aggregateRequestRef = useRef(0)
  const entityRequestRef = useRef({ accounts: 0, centers: 0, prospects: 0 })

  const filtersKey = useMemo(() => JSON.stringify(sanitizeFilters(filters)), [filters])
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Summary, facets, charts, and map aggregates for the current filters.
  useEffect(() => {
    if (!enabled) return
    const requestId = ++aggregateRequestRef.current
    const wireFilters = normalizeFiltersForServer(filtersRef.current, rangesRef.current)
    setIsFetching(true)
    Promise.all([
      fetchDashboardSummary(wireFilters),
      fetchDashboardFacets(wireFilters),
      fetchDashboardCharts(wireFilters),
      fetchCentersMap(wireFilters),
    ])
      .then(([summaryRes, facetsRes, chartsRes, mapRes]) => {
        if (aggregateRequestRef.current !== requestId) return
        setSummary(summaryRes)
        setFacets(facetsRes)
        setCharts(chartsRes)
        setMap(mapRes)
        setError(null)
      })
      .catch((err) => {
        if (aggregateRequestRef.current !== requestId) return
        devError("server dashboard aggregate fetch failed:", err)
        setError(err instanceof Error ? err.message : "Failed to load dashboard data")
      })
      .finally(() => {
        if (aggregateRequestRef.current === requestId) setIsFetching(false)
      })
  }, [enabled, filtersKey, refreshKey])

  // Unfiltered state aggregates for the choropleth color scale (once).
  useEffect(() => {
    if (!enabled || scaleStates !== null) return
    let cancelled = false
    fetchCentersMap(createDefaultFilters({ accountVisibilityMode: "all", accountHqRevenueRange: WIDE_RANGE, accountYearsInIndiaRange: WIDE_RANGE, centerIncYearRange: WIDE_RANGE }))
      .then((res) => {
        if (!cancelled) setScaleStates(res.states)
      })
      .catch((err) => devError("scale aggregates fetch failed:", err))
    return () => {
      cancelled = true
    }
  }, [enabled, scaleStates])

  // Per-entity paginated rows.
  const useEntityEffect = (entity: "accounts" | "centers" | "prospects", page: number, sort: EntitySort | null) => {
    const sortKey = sort ? `${sort.column}:${sort.direction}` : ""
    useEffect(() => {
      if (!enabled) return
      const requestId = ++entityRequestRef.current[entity]
      const wireFilters = normalizeFiltersForServer(filtersRef.current, rangesRef.current)
      fetchEntityPage(entity, wireFilters, page, pageSize, sort)
        .then((res) => {
          if (entityRequestRef.current[entity] !== requestId) return
          setEntityPages((prev) => ({ ...prev, [entity]: res }))
        })
        .catch((err) => {
          if (entityRequestRef.current[entity] !== requestId) return
          devError(`${entity} page fetch failed:`, err)
          setError(err instanceof Error ? err.message : `Failed to load ${entity}`)
        })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, filtersKey, page, sortKey, refreshKey])
  }
  /* eslint-disable react-hooks/rules-of-hooks -- fixed call order: the three entities are static */
  useEntityEffect("accounts", pages.accounts, sorts.accounts)
  useEntityEffect("centers", pages.centers, sorts.centers)
  useEntityEffect("prospects", pages.prospects, sorts.prospects)
  /* eslint-enable react-hooks/rules-of-hooks */

  const initialLoading = enabled && summary === null && error === null

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
    reload,
  }
}
