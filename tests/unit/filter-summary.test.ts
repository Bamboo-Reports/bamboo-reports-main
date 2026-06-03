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

  it("counts years-in-india range when different from default", () => {
    const filters = { ...cleanFilters(), accountYearsInIndiaRange: [5, 20] as [number, number] }
    expect(calculateActiveFilters(filters)).toBe(1)
  })

  it("counts center-inc-year range when different from default", () => {
    const filters = { ...cleanFilters(), centerIncYearRange: [2010, 2020] as [number, number] }
    expect(calculateActiveFilters(filters)).toBe(1)
  })

  it("counts keyword filter entries", () => {
    const filters = {
      ...cleanFilters(),
      accountGlobalLegalNameKeywords: [{ value: "Acme", mode: "include" as const }],
    }
    expect(calculateActiveFilters(filters)).toBe(1)
  })

  it("counts multiple keyword entries", () => {
    const filters = {
      ...cleanFilters(),
      techSoftwareInUseKeywords: [
        { value: "Salesforce", mode: "include" as const },
        { value: "SAP", mode: "include" as const },
      ],
    }
    expect(calculateActiveFilters(filters)).toBe(2)
  })

  it("counts prospect multi-select filters", () => {
    const filters = {
      ...cleanFilters(),
      prospectDepartmentValues: [{ value: "Engineering", mode: "include" as const }],
      prospectHeadTypeValues: [{ value: "Decision Maker", mode: "include" as const }],
    }
    expect(calculateActiveFilters(filters)).toBe(2)
  })

  it("counts all active filter types together", () => {
    const filters = {
      ...cleanFilters(),
      accountVisibilityMode: "nonGcc" as const,
      accountHqCountryValues: [
        { value: "India", mode: "include" as const },
        { value: "USA", mode: "include" as const },
      ],
      centerTypeValues: [{ value: "Captive", mode: "include" as const }],
      accountHqRevenueRange: [500, 5000] as [number, number],
    }
    expect(calculateActiveFilters(filters)).toBe(5)
  })

  it("handles center-state and center-country filters", () => {
    const filters = {
      ...cleanFilters(),
      centerStateValues: [{ value: "Karnataka", mode: "include" as const }],
      centerCountryValues: [{ value: "India", mode: "include" as const }],
    }
    expect(calculateActiveFilters(filters)).toBe(2)
  })

  it("handles function and software keyword filters", () => {
    const filters = {
      ...cleanFilters(),
      functionNameValues: [{ value: "Engineering", mode: "include" as const }],
      techSoftwareInUseKeywords: [{ value: "AWS", mode: "include" as const }],
    }
    expect(calculateActiveFilters(filters)).toBe(2)
  })

  it("counts all account multi-select filter arrays", () => {
    const filters = {
      ...cleanFilters(),
      accountHqIndustryValues: [{ value: "Software", mode: "include" as const }],
      accountPrimaryCategoryValues: [{ value: "Technology", mode: "include" as const }],
      accountPrimaryNatureValues: [{ value: "Enterprise", mode: "include" as const }],
      accountNasscomStatusValues: [{ value: "Listed", mode: "include" as const }],
      accountHqEmployeeRangeValues: [{ value: "1001-5000", mode: "include" as const }],
      accountCenterEmployeesRangeValues: [{ value: "501-1000", mode: "include" as const }],
    }
    expect(calculateActiveFilters(filters)).toBe(6)
  })
})
