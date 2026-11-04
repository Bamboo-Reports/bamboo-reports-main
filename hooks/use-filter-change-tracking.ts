"use client"

import { useEffect, useRef } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildFilterChangedEvents } from "@/lib/analytics/filter-change-events"
import type { Filters } from "@/lib/types"

// Changes this close together are reported as one batch.
const FILTER_TRACK_DELAY_MS = 350

/**
 * Reports filter_changed for each filter that changed, once the filters have
 * been still for FILTER_TRACK_DELAY_MS. Nothing is reported when no filter was
 * active before or after.
 */
export function useFilterChangeTracking(filters: Filters, countActive: (filters: Filters) => number) {
  const previousTrackedFiltersRef = useRef<Filters | null>(null)
  const filterTrackTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const previousFilters = previousTrackedFiltersRef.current
    if (!previousFilters) {
      previousTrackedFiltersRef.current = filters
      return
    }

    if (filterTrackTimeoutRef.current !== null) {
      window.clearTimeout(filterTrackTimeoutRef.current)
    }

    filterTrackTimeoutRef.current = window.setTimeout(() => {
      const previousActiveFiltersCount = countActive(previousFilters)
      const currentActiveFiltersCount = countActive(filters)

      if (previousActiveFiltersCount !== 0 || currentActiveFiltersCount !== 0) {
        for (const properties of buildFilterChangedEvents(previousFilters, filters, currentActiveFiltersCount)) {
          captureEvent(ANALYTICS_EVENTS.FILTER_CHANGED, properties)
        }
      }

      previousTrackedFiltersRef.current = filters
    }, FILTER_TRACK_DELAY_MS)

    return () => {
      if (filterTrackTimeoutRef.current !== null) {
        window.clearTimeout(filterTrackTimeoutRef.current)
      }
    }
  }, [filters, countActive])
}
