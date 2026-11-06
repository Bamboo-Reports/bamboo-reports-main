import type { Filters } from "@/lib/types"
import {
  createDefaultFilters,
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"

const coerceRange = (
  value: number[] | undefined | null,
  fallback: [number, number]
): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return fallback
  const [min, max] = value
  return [Number(min), Number(max)]
}

export function withFilterDefaults(filters: Partial<Filters> | null | undefined): Filters {
  const defaults = createDefaultFilters()
  // Copy only keys that Filters still has, so filters saved before a filter was
  // removed do not carry its stale key back into the dashboard state.
  const known: Partial<Filters> = {}
  if (filters) {
    for (const key of Object.keys(defaults) as Array<keyof Filters>) {
      if (Object.prototype.hasOwnProperty.call(filters, key)) {
        ;(known as Record<string, unknown>)[key] = filters[key]
      }
    }
  }

  return {
    ...defaults,
    ...known,
    accountHqRevenueRange: coerceRange(filters?.accountHqRevenueRange, DEFAULT_REVENUE_RANGE),
    accountYearsInIndiaRange: coerceRange(
      filters?.accountYearsInIndiaRange,
      DEFAULT_YEARS_IN_INDIA_RANGE
    ),
    centerIncYearRange: coerceRange(filters?.centerIncYearRange, DEFAULT_CENTER_INC_YEAR_RANGE),
  }
}
