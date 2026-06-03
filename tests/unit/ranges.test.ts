import { describe, expect, it } from "vitest"
import { calculateBaseRanges } from "@/lib/dashboard/ranges"
import type { Account, Center } from "@/lib/types"

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { account_global_legal_name: "Acme Corp", ...overrides } as Account
}

function makeCenter(overrides: Partial<Center> = {}): Center {
  return {
    account_global_legal_name: "Acme Corp",
    cn_unique_key: "CN-1",
    center_status: null,
    center_name: null,
    center_type: null,
    center_focus: null,
    ...overrides,
  } as Center
}

const DEFAULT_RANGE = { min: 0, max: 1000000 }

describe("calculateBaseRanges", () => {
  it("returns the default range for empty inputs", () => {
    const result = calculateBaseRanges([], [])
    expect(result.revenueRange).toEqual(DEFAULT_RANGE)
    expect(result.yearsInIndiaRange).toEqual(DEFAULT_RANGE)
    expect(result.centerIncYearRange).toEqual(DEFAULT_RANGE)
  })

  it("computes min and max revenue across accounts", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: 100 }),
      makeAccount({ account_hq_revenue: 500 }),
      makeAccount({ account_hq_revenue: 250 }),
    ]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 100, max: 500 })
  })

  it("ignores non-positive and non-finite revenue values", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: 0 }),
      makeAccount({ account_hq_revenue: null }),
      makeAccount({ account_hq_revenue: 300 }),
    ]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 300, max: 300 })
  })

  it("falls back to the default range when no revenue is positive", () => {
    const accounts = [makeAccount({ account_hq_revenue: 0 }), makeAccount({ account_hq_revenue: null })]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual(DEFAULT_RANGE)
  })

  it("computes the years-in-India range", () => {
    const accounts = [makeAccount({ years_in_india: 5 }), makeAccount({ years_in_india: 12 })]
    expect(calculateBaseRanges(accounts, []).yearsInIndiaRange).toEqual({ min: 5, max: 12 })
  })

  it("computes the center incorporation year range", () => {
    const centers = [
      makeCenter({ center_inc_year: 2010 }),
      makeCenter({ center_inc_year: 2022 }),
      makeCenter({ center_inc_year: 2015 }),
    ]
    expect(calculateBaseRanges([], centers).centerIncYearRange).toEqual({ min: 2010, max: 2022 })
  })

  it("handles Infinity and NaN revenue values", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: Infinity }),
      makeAccount({ account_hq_revenue: NaN }),
      makeAccount({ account_hq_revenue: 500 }),
    ]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 500, max: 500 })
  })

  it("handles negative revenue values", () => {
    const accounts = [makeAccount({ account_hq_revenue: -100 }), makeAccount({ account_hq_revenue: 200 })]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 200, max: 200 })
  })

  it("handles string revenue values via parseRevenue", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: "1500" as unknown as number }),
      makeAccount({ account_hq_revenue: "3500" as unknown as number }),
    ]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 1500, max: 3500 })
  })

  it("returns default range when accounts have unparseable revenue values", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: "N/A" as unknown as number }),
      makeAccount({ account_hq_revenue: "unknown" as unknown as number }),
    ]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual(DEFAULT_RANGE)
  })

  it("handles single account scenario", () => {
    const accounts = [makeAccount({ account_hq_revenue: 750 })]
    expect(calculateBaseRanges(accounts, []).revenueRange).toEqual({ min: 750, max: 750 })
  })

  it("handles single center scenario", () => {
    const centers = [makeCenter({ center_inc_year: 2020 })]
    expect(calculateBaseRanges([], centers).centerIncYearRange).toEqual({ min: 2020, max: 2020 })
  })

  it("combines accounts and centers data simultaneously", () => {
    const accounts = [makeAccount({ account_hq_revenue: 100, years_in_india: 5 })]
    const centers = [makeCenter({ center_inc_year: 2015 })]
    const result = calculateBaseRanges(accounts, centers)
    expect(result.revenueRange).toEqual({ min: 100, max: 100 })
    expect(result.yearsInIndiaRange).toEqual({ min: 5, max: 5 })
    expect(result.centerIncYearRange).toEqual({ min: 2015, max: 2015 })
  })

  it("handles years_in_india with 0 values", () => {
    const accounts = [makeAccount({ years_in_india: 0 }), makeAccount({ years_in_india: 10 })]
    expect(calculateBaseRanges(accounts, []).yearsInIndiaRange).toEqual({ min: 10, max: 10 })
  })

  it("handles center_inc_year with null values", () => {
    const centers = [makeCenter({ center_inc_year: null }), makeCenter({ center_inc_year: 2020 })]
    expect(calculateBaseRanges([], centers).centerIncYearRange).toEqual({ min: 2020, max: 2020 })
  })
})
