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
  it("returns 0 for a freshly created filter set", () => {
    expect(calculateActiveFilters(createDefaultFilters())).toBe(0)
  })

  it("counts each selected multi-value filter entry", () => {
    const filters = createDefaultFilters({
      accountHqCountryValues: [fv("India"), fv("USA")],
      centerCityValues: [fv("Bangalore")],
    })
    expect(calculateActiveFilters(filters)).toBe(3)
  })

  it("counts a non-default visibility mode as one active filter", () => {
    expect(calculateActiveFilters(createDefaultFilters({ accountVisibilityMode: "all" }))).toBe(1)
  })

  it("counts a narrowed revenue range as one active filter", () => {
    expect(calculateActiveFilters(createDefaultFilters({ accountHqRevenueRange: [100, 500] }))).toBe(1)
  })

  it("does not count a revenue range that equals the default", () => {
    const filters = createDefaultFilters({ accountHqRevenueRange: [...DEFAULT_REVENUE_RANGE] as [number, number] })
    expect(calculateActiveFilters(filters)).toBe(0)
  })

  it("does not count ranges that span the data's bounds", () => {
    const filters = createDefaultFilters({
      accountHqRevenueRange: [1, 716924],
      accountYearsInIndiaRange: [1, 76],
      centerIncYearRange: [1913, 2030],
    })
    const bounds = {
      revenue: { min: 1, max: 716924 },
      yearsInIndia: { min: 1, max: 76 },
      centerIncYear: { min: 1913, max: 2030 },
    }
    expect(calculateActiveFilters(filters, bounds)).toBe(0)
    expect(calculateActiveFilters({ ...filters, accountYearsInIndiaRange: [10, 76] }, bounds)).toBe(1)
  })

  it("counts an include-null toggle only once it is turned off", () => {
    expect(calculateActiveFilters(createDefaultFilters({ accountHqRevenueIncludeNull: true }))).toBe(0)
    expect(calculateActiveFilters(createDefaultFilters({ accountHqRevenueIncludeNull: false }))).toBe(1)
  })
})
