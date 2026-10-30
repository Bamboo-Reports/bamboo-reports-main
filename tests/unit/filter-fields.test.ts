import { describe, expect, it } from "vitest"
import { countActiveFilters, isRangeActive } from "@/components/filters/filter-fields"
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

describe("isRangeActive", () => {
  it("treats switching off records with no value as set", () => {
    expect(isRangeActive([1, 716924], bounds.revenue, false)).toBe(true)
  })
})
