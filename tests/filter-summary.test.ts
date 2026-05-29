import { describe, expect, it } from "vitest"
import { calculateActiveFilters, withFilterDefaults } from "@/lib/dashboard/filter-summary"
import { createDefaultFilters, DEFAULT_REVENUE_RANGE } from "@/lib/dashboard/defaults"
import type { FilterValue } from "@/lib/types"

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

  it("falls back to the default range for a malformed range", () => {
    const result = withFilterDefaults({ accountHqRevenueRange: [10] as unknown as [number, number] })
    expect(result.accountHqRevenueRange).toEqual(DEFAULT_REVENUE_RANGE)
  })
})

describe("calculateActiveFilters", () => {
  // The three include-null toggles default to true, so a freshly created
  // filter set already counts as 3 active filters.
  const cleanFilters = () =>
    createDefaultFilters({
      accountHqRevenueIncludeNull: false,
      yearsInIndiaIncludeNull: false,
      centerIncYearIncludeNull: false,
    })

  it("returns 0 once the default include-null toggles are cleared", () => {
    expect(calculateActiveFilters(cleanFilters())).toBe(0)
  })

  it("counts the default include-null toggles", () => {
    expect(calculateActiveFilters(createDefaultFilters())).toBe(3)
  })

  it("counts each selected multi-value filter entry", () => {
    const filters = {
      ...cleanFilters(),
      accountHqCountryValues: [fv("India"), fv("USA")],
      centerCityValues: [fv("Bangalore")],
    }
    expect(calculateActiveFilters(filters)).toBe(3)
  })

  it("counts a non-default visibility mode as one active filter", () => {
    const filters = { ...cleanFilters(), accountVisibilityMode: "all" as const }
    expect(calculateActiveFilters(filters)).toBe(1)
  })

  it("counts a narrowed revenue range as one active filter", () => {
    const filters = { ...cleanFilters(), accountHqRevenueRange: [100, 500] as [number, number] }
    expect(calculateActiveFilters(filters)).toBe(1)
  })

  it("does not count a revenue range that equals the default", () => {
    const filters = { ...cleanFilters(), accountHqRevenueRange: [...DEFAULT_REVENUE_RANGE] as [number, number] }
    expect(calculateActiveFilters(filters)).toBe(0)
  })

  it("counts a single include-null toggle", () => {
    const filters = { ...cleanFilters(), accountHqRevenueIncludeNull: true }
    expect(calculateActiveFilters(filters)).toBe(1)
  })
})
