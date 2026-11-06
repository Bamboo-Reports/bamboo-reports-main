import { describe, expect, it } from "vitest"
import { countActiveFilters } from "@/lib/dashboard/active-filters"
import { withFilterDefaults } from "@/lib/dashboard/filter-summary"
import { createDefaultFilters, DEFAULT_REVENUE_RANGE } from "@/lib/dashboard/defaults"
import type { FilterValue, Filters } from "@/lib/types"

const fv = (value: string): FilterValue => ({ value, mode: "include" })

describe("withFilterDefaults", () => {
  it("returns full defaults for null input", () => {
    expect(withFilterDefaults(null)).toEqual(createDefaultFilters())
  })

  it("returns full defaults for undefined input", () => {
    expect(withFilterDefaults(undefined)).toEqual(createDefaultFilters())
  })

  it("merges partial overrides onto the defaults", () => {
    const result = withFilterDefaults({ accountHqCountryValues: [fv("India")] })
    expect(result.accountHqCountryValues).toEqual([fv("India")])
    expect(result.accountHqRegionValues).toEqual([])
  })

  it("coerces a valid range pair to numbers", () => {
    const result = withFilterDefaults({
      accountHqRevenueRange: ["100", "500"] as unknown as [number, number],
    })
    expect(result.accountHqRevenueRange).toEqual([100, 500])
  })

  it("drops keys for filters that no longer exist, as old saved filters may carry them", () => {
    const merged = withFilterDefaults({
      accountHqCountryValues: [fv("India")],
      accountSourceValues: [fv("Web")],
      centerCountryValues: [fv("India")],
    } as unknown as Partial<Filters>)
    expect(merged).toEqual(createDefaultFilters({ accountHqCountryValues: [fv("India")] }))
    expect(countActiveFilters(merged)).toBe(1)
  })

  it("falls back to the default range for a malformed range", () => {
    const result = withFilterDefaults({ accountHqRevenueRange: [10] as unknown as [number, number] })
    expect(result.accountHqRevenueRange).toEqual(DEFAULT_REVENUE_RANGE)
  })
})
