import type { Filters } from "@/lib/types"
import type { FilterRangeBounds } from "@/lib/dashboard/active-filters"

/**
 * A range that sets no limit. Wider than any data, so loading it clamps it to
 * the full range of the data at that time, and a range filter never counts it
 * as set.
 */
export const UNSET_RANGE: readonly [number, number] = [0, Number.MAX_SAFE_INTEGER]

// The data's limits the dashboard measures its ranges against right now, or
// null until they are known. There is one dashboard, so one value for the app.
let currentLimits: FilterRangeBounds | null = null

/** Records the data's limits (null while they are only placeholders). */
export function setCurrentRangeLimits(limits: FilterRangeBounds | null): void {
  currentLimits = limits
}

/** The data's limits right now, or null while they are not known. */
export function getCurrentRangeLimits(): FilterRangeBounds | null {
  return currentLimits
}

/**
 * The filters to store in a saved filter: a range that spans the current
 * limits (the slider left alone) is stored as UNSET_RANGE, so it still spans
 * the data when the limits grow later. Without known limits nothing changes.
 */
export function withUnsetRanges(filters: Filters, limits: FilterRangeBounds | null = currentLimits): Filters {
  if (!limits) return filters
  const store = (value: [number, number], bounds: { min: number; max: number }): [number, number] =>
    value[0] <= bounds.min && value[1] >= bounds.max ? [...UNSET_RANGE] : value
  return {
    ...filters,
    accountHqRevenueRange: store(filters.accountHqRevenueRange, limits.revenue),
    accountYearsInIndiaRange: store(filters.accountYearsInIndiaRange, limits.yearsInIndia),
    centerIncYearRange: store(filters.centerIncYearRange, limits.centerIncYear),
  }
}
