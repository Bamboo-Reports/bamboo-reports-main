import { describe, expect, it } from "vitest"
import { countActiveFilters, isRangeActive } from "@/lib/dashboard/active-filters"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import type { Filters } from "@/lib/types"

const bounds = {
  revenue: { min: 1, max: 716924 },
  yearsInIndia: { min: 0, max: 68 },
  centerIncYear: { min: 1913, max: 2030 },
}

// Data limits as they arrive from the server: nothing set yet.
const empty = (): Filters =>
  createDefaultFilters({
    accountHqRevenueRange: [1, 716924],
    accountYearsInIndiaRange: [0, 68],
    centerIncYearRange: [1913, 2030],
  })

describe("countActiveFilters", () => {
  it("is zero with nothing set", () => {
    expect(countActiveFilters(empty(), bounds)).toBe(0)
  })

  it("counts a field once however many values it has", () => {
    const filters = {
      ...empty(),
      accountPrimaryCategoryValues: [
        { value: "BFSI", mode: "include" as const },
        { value: "Technology", mode: "include" as const },
        { value: "Retail", mode: "exclude" as const },
      ],
    }
    expect(countActiveFilters(filters, bounds)).toBe(1)
  })

  it("counts the accounts switch only when it moves off GCCs", () => {
    expect(countActiveFilters({ ...empty(), accountVisibilityMode: "gcc" }, bounds)).toBe(0)
    expect(countActiveFilters({ ...empty(), accountVisibilityMode: "all" }, bounds)).toBe(1)
  })

  it("counts a narrowed range, but not the wide default an older saved filter stored", () => {
    expect(countActiveFilters({ ...empty(), accountHqRevenueRange: [2000, 716924] }, bounds)).toBe(1)
    expect(countActiveFilters({ ...empty(), accountHqRevenueRange: [0, 1000000] }, bounds)).toBe(0)
  })

  it("fills in fields a saved filter predates", () => {
    const saved = { accountHqCountryValues: [{ value: "India", mode: "exclude" as const }] }
    expect(countActiveFilters(saved, bounds)).toBe(1)
  })
})

describe("countActiveFilters without the data's limits", () => {
  // Analytics on saved filters have no bounds to hand, so the widest range a
  // filter can hold stands in for them.
  it("is zero for a freshly created filter set", () => {
    expect(countActiveFilters(createDefaultFilters())).toBe(0)
  })

  it("counts each range whose records with no value are switched off", () => {
    const filters = createDefaultFilters({
      accountHqRevenueIncludeNull: false,
      yearsInIndiaIncludeNull: false,
      centerIncYearIncludeNull: false,
    })
    expect(countActiveFilters(filters)).toBe(3)
  })

  it("counts a narrowed range once, with or without its toggle", () => {
    expect(countActiveFilters(createDefaultFilters({ accountHqRevenueRange: [100, 500] }))).toBe(1)
    expect(
      countActiveFilters(createDefaultFilters({ accountHqRevenueRange: [100, 500], accountHqRevenueIncludeNull: false }))
    ).toBe(1)
  })

  it("counts fields, not values, like the sidebar badge", () => {
    const filters = createDefaultFilters({
      accountHqCountryValues: [
        { value: "India", mode: "include" },
        { value: "USA", mode: "include" },
      ],
      centerCityValues: [{ value: "Bangalore", mode: "include" }],
      accountVisibilityMode: "all",
    })
    expect(countActiveFilters(filters)).toBe(3)
  })
})

describe("isRangeActive", () => {
  it("treats switching off records with no value as set", () => {
    expect(isRangeActive([1, 716924], bounds.revenue, false)).toBe(true)
  })
})
