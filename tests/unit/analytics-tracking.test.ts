import { describe, expect, it } from "vitest"
import {
  MAX_TRACKED_TEXT_LENGTH,
  buildTrackedFiltersSnapshot,
  normalizeTrackedText,
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
  toTrackedStringArray,
} from "@/lib/analytics/tracking"
import { fv, makeFilters } from "../fixtures/domain"

describe("analytics tracking helpers", () => {
  it("normalizes, dedupes, limits, and skips invalid tracked strings", () => {
    expect(normalizeTrackedText(` ${"a".repeat(MAX_TRACKED_TEXT_LENGTH + 5)} `)).toHaveLength(MAX_TRACKED_TEXT_LENGTH)
    expect(toTrackedStringArray([" A ", "A", "", null, "B"], 2)).toEqual(["A", "B"])
  })

  it("serializes filter values with or without modes", () => {
    expect(toTrackedFilterValueArray([fv("India"), fv("USA", "exclude")])).toEqual(["include:India", "exclude:USA"])
    expect(toTrackedFilterPlainValues([fv("India")])).toEqual(["India"])
  })

  it("builds a compact snapshot of active filters and range values", () => {
    const filters = makeFilters({
      accountVisibilityMode: "all",
      accountHqCountryValues: [fv("India")],
      accountHqRevenueRange: [100, 500],
      accountYearsInIndiaRange: [0, 1000000],
      centerIncYearRange: [0, 1000000],
    })
    const snapshot = buildTrackedFiltersSnapshot(filters, {
      accountHqRevenueRange: [0, 1000000],
      accountYearsInIndiaRange: [0, 1000000],
      centerIncYearRange: [0, 1000000],
    })
    expect(snapshot.active_filter_keys).toEqual(
      expect.arrayContaining(["accountVisibilityMode", "accountHqCountryValues", "accountHqRevenueRange"])
    )
    expect(snapshot.account_countries).toEqual(["include:India"])
    expect(snapshot.account_revenue_range_min).toBe(100)
    expect(snapshot.account_revenue_range_max).toBe(500)
  })
})
