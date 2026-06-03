import { describe, expect, it } from "vitest"
import { changedFilterKeys, getActiveFilterCountFor, isNumberRange, serializeFilterValues } from "@/lib/filter-utils"
import { makeFilters } from "../fixtures/domain"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

describe("changedFilterKeys", () => {
  it("returns empty array when objects are identical", () => {
    const prev = makeFilters()
    expect(changedFilterKeys(prev, { ...prev })).toEqual([])
  })

  it("detects changed values", () => {
    const filters = makeFilters()
    const next = { ...filters, accountVisibilityMode: "all" as const }
    expect(changedFilterKeys(filters, next)).toContain("accountVisibilityMode")
  })

  it("detects additions to array filters", () => {
    const filters = makeFilters()
    const next = {
      ...filters,
      accountHqRegionValues: [...filters.accountHqRegionValues, { value: "APAC", mode: "include" as const }],
    }
    expect(changedFilterKeys(filters, next)).toContain("accountHqRegionValues")
  })

  it("detects removals from array filters", () => {
    const baseFilters = createDefaultFilters({
      accountHqCountryValues: [{ value: "India", mode: "include" }],
    })
    const next = { ...baseFilters, accountHqCountryValues: [] }
    expect(changedFilterKeys(baseFilters, next)).toContain("accountHqCountryValues")
  })

  it("returns multiple changed keys", () => {
    const filters = makeFilters()
    const next = {
      ...filters,
      accountVisibilityMode: "nonGcc" as const,
      accountHqRegionValues: [...filters.accountHqRegionValues, { value: "EMEA", mode: "include" as const }],
      centerCityValues: [...filters.centerCityValues, { value: "Bengaluru", mode: "include" as const }],
    }
    const changed = changedFilterKeys(filters, next)
    expect(changed).toContain("accountVisibilityMode")
    expect(changed).toContain("accountHqRegionValues")
    expect(changed).toContain("centerCityValues")
    expect(changed.length).toBe(3)
  })
})

describe("isNumberRange", () => {
  it("returns true for a tuple of two numbers", () => {
    expect(isNumberRange([0, 100])).toBe(true)
    expect(isNumberRange([-5, 5000])).toBe(true)
  })

  it("returns false for non-arrays", () => {
    expect(isNumberRange(null)).toBe(false)
    expect(isNumberRange(undefined)).toBe(false)
    expect(isNumberRange("string")).toBe(false)
    expect(isNumberRange(42)).toBe(false)
  })

  it("returns false for arrays with wrong length", () => {
    expect(isNumberRange([1])).toBe(false)
    expect(isNumberRange([1, 2, 3])).toBe(false)
  })

  it("returns false for arrays with non-number elements", () => {
    expect(isNumberRange(["a", "b"])).toBe(false)
    expect(isNumberRange([1, "b"])).toBe(false)
  })
})

describe("serializeFilterValues", () => {
  it("serializes and sorts filter values", () => {
    const result = serializeFilterValues([
      { value: "India", mode: "include" },
      { value: "USA", mode: "include" },
    ])
    expect(result).toEqual(["include:India", "include:USA"])
  })

  it("handles mixed modes", () => {
    const result = serializeFilterValues([
      { value: "Engineering", mode: "include" },
      { value: "Sales", mode: "exclude" },
    ])
    expect(result).toEqual(["exclude:Sales", "include:Engineering"])
  })

  it("returns empty array for empty input", () => {
    expect(serializeFilterValues([])).toEqual([])
  })
})

describe("getActiveFilterCountFor", () => {
  const ranges = {
    revenueRange: { min: 0, max: 1000000 },
    yearsInIndiaRange: { min: 0, max: 1000000 },
    centerIncYearRange: { min: 0, max: 1000000 },
  }

  it("returns count for default filters (include-null flags)", () => {
    const count = getActiveFilterCountFor(makeFilters(), ranges)
    expect(count).toBe(3)
  })

  it("counts multi-select values on top of defaults", () => {
    const filters = createDefaultFilters({
      centerCityValues: [{ value: "Bengaluru", mode: "include" }],
      centerStatusValues: [
        { value: "Active", mode: "include" },
        { value: "Closed", mode: "exclude" },
      ],
    })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(6)
  })

  it("counts visibility mode when not gcc", () => {
    const filters = createDefaultFilters({ accountVisibilityMode: "all" })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(4)
  })

  it("counts revenue range when different from default", () => {
    const filters = createDefaultFilters({ accountHqRevenueRange: [100, 50000] })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(4)
  })

  it("counts years-in-india range when different from default", () => {
    const filters = createDefaultFilters({ accountYearsInIndiaRange: [5, 50000] })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(4)
  })

  it("counts center inc-year range when different from default", () => {
    const filters = createDefaultFilters({ centerIncYearRange: [2000, 2020] })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(4)
  })

  it("counts include-null booleans", () => {
    const filters = createDefaultFilters({
      accountHqRevenueIncludeNull: true,
      yearsInIndiaIncludeNull: false,
      centerIncYearIncludeNull: true,
    })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(2)
  })

  it("counts keyword filters", () => {
    const filters = createDefaultFilters({
      accountGlobalLegalNameKeywords: [{ value: "Acme", mode: "include" }],
      techSoftwareInUseKeywords: [{ value: "Salesforce", mode: "include" }],
    })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(5)
  })

  it("accumulates multiple filter types combined", () => {
    const filters = createDefaultFilters({
      accountVisibilityMode: "all",
      accountHqRegionValues: [
        { value: "APAC", mode: "include" },
        { value: "EMEA", mode: "include" },
      ],
      centerTypeValues: [{ value: "Captive", mode: "include" }],
      accountHqRevenueRange: [500, 200000],
      accountHqRevenueIncludeNull: false,
    })
    const count = getActiveFilterCountFor(filters, ranges)
    expect(count).toBe(7)
  })
})
