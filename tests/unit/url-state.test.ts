import { describe, expect, it } from "vitest"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import {
  decodeDashboardUrl,
  encodeDashboardUrl,
  filtersDiff,
  filtersFromUrl,
  type RangeBounds,
} from "@/lib/dashboard/url-state"

const bounds: RangeBounds = {
  revenue: { min: 0, max: 900000 },
  yearsInIndia: { min: 0, max: 60 },
  centerIncYear: { min: 1950, max: 2026 },
}

const base = () =>
  createDefaultFilters({
    accountHqRevenueRange: [0, 900000],
    accountYearsInIndiaRange: [0, 60],
    centerIncYearRange: [1950, 2026],
  })

describe("dashboard url state", () => {
  it("is empty when everything is at its default", () => {
    expect(encodeDashboardUrl({ section: "accounts", view: "map", filters: base() }, bounds)).toBe("")
  })

  it("round-trips the view and the filters that changed", () => {
    const filters = {
      ...base(),
      accountVisibilityMode: "nonGcc" as const,
      centerCityValues: [{ value: "Bengaluru", mode: "include" as const }],
      prospectTitleKeywords: [{ value: "O’Brien & co", mode: "exclude" as const }],
      accountHqRevenueRange: [100, 999] as [number, number],
      yearsInIndiaIncludeNull: false,
    }
    const search = encodeDashboardUrl({ section: "centers", view: "data", filters }, bounds)
    expect(search).toMatch(/^\?view=centers&show=data&f=/)

    const decoded = decodeDashboardUrl(search)
    expect(decoded.section).toBe("centers")
    expect(decoded.view).toBe("data")
    expect(filtersFromUrl(decoded.filters!, bounds)).toEqual(filters)
  })

  it("stores account lists by id, not their names", () => {
    const filters = {
      ...base(),
      accountListValues: [{ value: "list-1", mode: "include" as const }],
      accountNameValues: Array.from({ length: 300 }, (_, i) => ({ value: `Company ${i}`, mode: "include" as const })),
    }
    const diff = filtersDiff(filters, bounds)
    expect(diff.accountListValues).toEqual(filters.accountListValues)
    expect(diff.accountNameValues).toBeUndefined()
  })

  it("ignores malformed or unknown values", () => {
    expect(decodeDashboardUrl("?view=nope&show=table&f=%%%")).toEqual({ section: null, view: null, filters: null })
    const junk = btoa(JSON.stringify({ evil: 1, centerCityValues: "Pune", accountVisibilityMode: "x", centerIncYearRange: [1, "2"] }))
    expect(decodeDashboardUrl(`?f=${junk}`).filters).toBeNull()
  })
})
