"use client"

import { useEffect, useRef, useState } from "react"
import type { Filters } from "@/lib/types"
import { useAccountLists } from "@/contexts/account-lists-context"
import {
  DEFAULT_REVENUE_RANGE,
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"
import {
  decodeDashboardUrl,
  encodeDashboardUrl,
  filtersFromUrl,
  type RangeBounds,
  type UrlSection,
  type UrlView,
} from "@/lib/dashboard/url-state"

/** How long a link's account lists may take to load before the filters are restored without them. */
const LIST_WAIT_MS = 4000

const DEFAULT_BOUNDS: RangeBounds = {
  revenue: { min: DEFAULT_REVENUE_RANGE[0], max: DEFAULT_REVENUE_RANGE[1] },
  yearsInIndia: { min: DEFAULT_YEARS_IN_INDIA_RANGE[0], max: DEFAULT_YEARS_IN_INDIA_RANGE[1] },
  centerIncYear: { min: DEFAULT_CENTER_INC_YEAR_RANGE[0], max: DEFAULT_CENTER_INC_YEAR_RANGE[1] },
}

interface UseDashboardUrlSyncParams {
  /** Applied filters. */
  filters: Filters
  /** Slider bounds from the server; null until they arrive. */
  bounds: RangeBounds | null
  /** Applies restored filters (the saved-filter loader: clamps ranges, expands lists). */
  applyFilters: (filters: Filters) => void
  section: UrlSection
  setSection: (section: UrlSection) => void
  /** The open view (Charts, Map or Data) of the current section. */
  view: UrlView
  /** Opens a view in the given section. */
  setView: (section: UrlSection, view: UrlView) => void
}

/**
 * Keeps the dashboard's filters and view in the address bar. On load the
 * address is read once: the section and view right away, the filters once the
 * slider bounds (and any account lists the link names) have loaded. From then
 * on every change replaces the address, without adding history entries.
 */
export function useDashboardUrlSync({
  filters,
  bounds,
  applyFilters,
  section,
  setSection,
  view,
  setView,
}: UseDashboardUrlSyncParams) {
  const { lists } = useAccountLists()
  const pendingRef = useRef<Partial<Filters> | null>(null)
  const [restored, setRestored] = useState(false)
  const [listWaitOver, setListWaitOver] = useState(false)

  // Read the address once, on load.
  useEffect(() => {
    const decoded = decodeDashboardUrl(window.location.search)
    const startSection = decoded.section ?? section
    if (decoded.section) setSection(decoded.section)
    if (decoded.view && !(startSection === "prospects" && decoded.view === "map")) setView(startSection, decoded.view)
    pendingRef.current = decoded.filters
    if (!decoded.filters) {
      setRestored(true)
      return
    }
    const timer = window.setTimeout(() => setListWaitOver(true), LIST_WAIT_MS)
    return () => window.clearTimeout(timer)
    // Runs once: later changes flow the other way, from state to the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore the filters once what they depend on has loaded.
  useEffect(() => {
    const pending = pendingRef.current
    if (restored || !pending || !bounds) return
    const known = new Set(lists.map((list) => list.id))
    const listsReady = (pending.accountListValues ?? []).every((entry) => known.has(entry.value))
    if (!listsReady && !listWaitOver) return
    pendingRef.current = null
    applyFilters(filtersFromUrl(pending, bounds))
    setRestored(true)
  }, [restored, bounds, lists, listWaitOver, applyFilters])

  // Write every change back to the address.
  useEffect(() => {
    if (!restored) return
    const search = encodeDashboardUrl({ section, view, filters }, bounds ?? DEFAULT_BOUNDS)
    if (search === window.location.search) return
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`)
  }, [restored, filters, section, view, bounds])
}
