"use client"

import { useEffect, useRef } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildFilterChangedEvents } from "@/lib/analytics/filter-change-events"
import { countActiveFilters, type RangeBaselines } from "@/lib/dashboard/active-filters"
import type { Filters } from "@/lib/types"

// Changes this close together are reported as one batch.
const FILTER_TRACK_DELAY_MS = 350

const RANGE_BASELINE_KEYS = [
  ["accountHqRevenueRange", "revenue"],
  ["accountYearsInIndiaRange", "yearsInIndia"],
  ["centerIncYearRange", "centerIncYear"],
] as const

const isFullRange = (range: [number, number], bounds: { min: number; max: number }) =>
  range[0] === bounds.min && range[1] === bounds.max

/**
 * The previous filters, with any range that only followed its bounds (full
 * range before, full range of the new bounds now) set to its current value.
 * New bounds arriving from the server move the sliders, but that is not a
 * filter change by the user.
 */
function withoutBoundsMoves(
  previous: Filters,
  previousBaselines: RangeBaselines,
  current: Filters,
  currentBaselines: RangeBaselines
): Filters {
  let result = previous
  for (const [key, baseline] of RANGE_BASELINE_KEYS) {
    if (
      isFullRange(previous[key], previousBaselines[baseline]) &&
      isFullRange(current[key], currentBaselines[baseline]) &&
      (previous[key][0] !== current[key][0] || previous[key][1] !== current[key][1])
    ) {
      result = { ...result, [key]: current[key] }
    }
  }
  return result
}

/**
 * Reports filter_changed for each filter the user changed, once the filters
 * have been still for FILTER_TRACK_DELAY_MS. Nothing is reported when no
 * filter was active before or after. Each side is measured against the range
 * bounds that applied to it, so the sliders settling on the real bounds after
 * the first load is not reported.
 */
export function useFilterChangeTracking(filters: Filters, baselines: RangeBaselines) {
  const previousTrackedRef = useRef<{ filters: Filters; baselines: RangeBaselines } | null>(null)
  const filterTrackTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const previous = previousTrackedRef.current
    if (!previous) {
      previousTrackedRef.current = { filters, baselines }
      return
    }

    if (filterTrackTimeoutRef.current !== null) {
      window.clearTimeout(filterTrackTimeoutRef.current)
    }

    filterTrackTimeoutRef.current = window.setTimeout(() => {
      const previousActiveFiltersCount = countActiveFilters(previous.filters, previous.baselines)
      const currentActiveFiltersCount = countActiveFilters(filters, baselines)

      if (previousActiveFiltersCount !== 0 || currentActiveFiltersCount !== 0) {
        const comparable = withoutBoundsMoves(previous.filters, previous.baselines, filters, baselines)
        for (const properties of buildFilterChangedEvents(comparable, filters, currentActiveFiltersCount)) {
          captureEvent(ANALYTICS_EVENTS.FILTER_CHANGED, properties)
        }
      }

      previousTrackedRef.current = { filters, baselines }
    }, FILTER_TRACK_DELAY_MS)

    return () => {
      if (filterTrackTimeoutRef.current !== null) {
        window.clearTimeout(filterTrackTimeoutRef.current)
      }
    }
  }, [filters, baselines])
}
