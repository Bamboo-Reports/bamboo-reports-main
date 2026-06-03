import { describe, expect, it } from "vitest"
import {
  createDefaultFilters,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
  DEFAULT_CENTER_INC_YEAR_RANGE,
} from "@/lib/dashboard/defaults"

describe("createDefaultFilters", () => {
  it("returns all default values with no overrides", () => {
    const filters = createDefaultFilters()
    expect(filters.accountVisibilityMode).toBe("gcc")
    expect(filters.accountHqRevenueRange).toEqual(DEFAULT_REVENUE_RANGE)
    expect(filters.accountYearsInIndiaRange).toEqual(DEFAULT_YEARS_IN_INDIA_RANGE)
    expect(filters.centerIncYearRange).toEqual(DEFAULT_CENTER_INC_YEAR_RANGE)
    expect(filters.accountHqRevenueIncludeNull).toBe(true)
    expect(filters.yearsInIndiaIncludeNull).toBe(true)
    expect(filters.centerIncYearIncludeNull).toBe(true)
    expect(filters.accountHqRegionValues).toEqual([])
    expect(filters.accountHqCountryValues).toEqual([])
    expect(filters.centerTypeValues).toEqual([])
    expect(filters.centerCityValues).toEqual([])
    expect(filters.functionNameValues).toEqual([])
    expect(filters.prospectDepartmentValues).toEqual([])
    expect(filters.prospectTitleKeywords).toEqual([])
  })

  it("merges partial overrides onto defaults", () => {
    const filters = createDefaultFilters({
      accountVisibilityMode: "all",
      accountHqCountryValues: [],
    })
    expect(filters.accountVisibilityMode).toBe("all")
    expect(filters.accountHqRevenueIncludeNull).toBe(true)
  })

  it("preserves empty arrays from overrides", () => {
    const filters = createDefaultFilters({ centerTypeValues: [] })
    expect(filters.centerTypeValues).toEqual([])
  })

  it("preserves custom ranges from overrides", () => {
    const filters = createDefaultFilters({ accountHqRevenueRange: [100, 500] as [number, number] })
    expect(filters.accountHqRevenueRange).toEqual([100, 500])
  })

  it("sets include-null defaults when overrides provide different values", () => {
    const filters = createDefaultFilters({
      accountHqRevenueIncludeNull: false,
    })
    expect(filters.accountHqRevenueIncludeNull).toBe(false)
    expect(filters.yearsInIndiaIncludeNull).toBe(true)
    expect(filters.centerIncYearIncludeNull).toBe(true)
  })

  it("allows setting all include-null toggles off", () => {
    const filters = createDefaultFilters({
      accountHqRevenueIncludeNull: false,
      yearsInIndiaIncludeNull: false,
      centerIncYearIncludeNull: false,
    })
    expect(filters.accountHqRevenueIncludeNull).toBe(false)
    expect(filters.yearsInIndiaIncludeNull).toBe(false)
    expect(filters.centerIncYearIncludeNull).toBe(false)
  })

  it("defaults keyword filter arrays to empty", () => {
    const filters = createDefaultFilters()
    expect(filters.accountGlobalLegalNameKeywords).toEqual([])
    expect(filters.techSoftwareInUseKeywords).toEqual([])
    expect(filters.prospectTitleKeywords).toEqual([])
  })

  it("defaults prospect filter arrays to empty", () => {
    const filters = createDefaultFilters()
    expect(filters.prospectDepartmentValues).toEqual([])
    expect(filters.prospectHeadTypeValues).toEqual([])
    expect(filters.prospectLevelValues).toEqual([])
    expect(filters.prospectCityValues).toEqual([])
  })
})
