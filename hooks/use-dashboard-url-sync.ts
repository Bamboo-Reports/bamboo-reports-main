"use client"

import { useEffect, useRef, useState } from "react"
import type { Filters } from "@/lib/types"
import { useAccountLists } from "@/contexts/account-lists-context"
import { countActiveFilters, type FilterRangeBounds } from "@/lib/dashboard/active-filters"
import {
  decodeDashboardUrl,
  encodeDashboardUrl,
  filtersFromUrl,
  type UrlSection,
  type UrlView,
} from "@/lib/dashboard/url-state"

/** The longest a link waits for its account lists; it stops sooner, as soon as the lists have loaded. */
const LIST_WAIT_MS = 4000

/**
 * Whether a filter has been applied since the page loaded. The ranges are
 * measured against themselves: they move on their own when the data's limits
 * arrive, so only the other fields say that someone made a choice.
 */
const hasAppliedFilter = (filters: Filters) =>
  countActiveFilters(filters, {
    revenue: { min: filters.accountHqRevenueRange[0], max: filters.accountHqRevenueRange[1] },
    yearsInIndia: { min: filters.accountYearsInIndiaRange[0], max: filters.accountYearsInIndiaRange[1] },
    centerIncYear: { min: filters.centerIncYearRange[0], max: filters.centerIncYearRange[1] },
  }) > 0

interface UseDashboardUrlSyncParams {
  /** Applied filters. */
  filters: Filters
  /**
   * The limits the filters are measured against right now: the same ones the
   * filters hook holds, so the two never disagree for a render. They are
   * placeholders until the data's own limits arrive (boundsKnown).
   */
  bounds: FilterRangeBounds
  /** False while the limits are still placeholders. */
  boundsKnown: boolean
  /** Applies restored filters (the saved-filter loader: expands lists, and clamps ranges unless told not to). */
  applyFilters: (filters: Filters, options?: { clampRanges?: boolean }) => void
  section: UrlSection
  setSection: (section: UrlSection) => void
  /** The open view (Charts, Map or Data) of the current section. */
  view: UrlView
  /** Opens a view in the given section. */
  setView: (section: UrlSection, view: UrlView) => void
}

/**
 * Keeps the dashboard's filters and view in the address bar. On load the
 * address is read once: the section and view right away, and the filters too,
 * unless the link names account lists, which are waited for briefly. The
 * dashboard holds its first data request until then (filtersRestored). From then
 * on every change replaces the address, without adding history entries.
 */
export function useDashboardUrlSync({
  filters,
  bounds,
  boundsKnown,
  applyFilters,
  section,
  setSection,
  view,
  setView,
}: UseDashboardUrlSyncParams) {
  const { lists, loaded: listsLoaded } = useAccountLists()
  const pendingRef = useRef<Partial<Filters> | null>(null)
  const [restored, setRestored] = useState(false)
  // The section and view are applied on the first effect; the filters may wait for the account lists.
  const [layoutRestored, setLayoutRestored] = useState(false)
  const [listWaitOver, setListWaitOver] = useState(false)

  // Read the address once, on load.
  useEffect(() => {
    const decoded = decodeDashboardUrl(window.location.search)
    const startSection = decoded.section ?? section
    if (decoded.section) setSection(decoded.section)
    if (decoded.view && !(startSection === "prospects" && decoded.view === "map")) setView(startSection, decoded.view)
    setLayoutRestored(true)
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
    if (restored || !pending) return
    // Filters applied while the link was still loading win over the link's.
    if (hasAppliedFilter(filters)) {
      pendingRef.current = null
      setRestored(true)
      return
    }
    const known = new Set(lists.map((list) => list.id))
    const listsReady = (pending.accountListValues ?? []).every((entry) => known.has(entry.value))
    // Once the lists have loaded, a list that is still missing is not coming
    // (someone else's, or deleted): the link's own names stand in for it.
    if (!listsReady && !listsLoaded && !listWaitOver) return
    pendingRef.current = null
    // The data's limits are not needed to apply a link: a range the link sets
    // is kept as it is (not clamped to the placeholder limits), and the
    // others follow the limits once they arrive.
    applyFilters(filtersFromUrl(pending, bounds), { clampRanges: boundsKnown })
    setRestored(true)
  }, [restored, bounds, boundsKnown, lists, listsLoaded, listWaitOver, applyFilters, filters])

  // Write every change back to the address.
  useEffect(() => {
    if (!restored) return
    const search = encodeDashboardUrl({ section, view, filters }, bounds)
    if (search === window.location.search) return
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`)
  }, [restored, filters, section, view, bounds])

  return { layoutRestored, filtersRestored: restored }
}
