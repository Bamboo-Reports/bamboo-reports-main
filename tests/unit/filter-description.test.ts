import { describe, expect, it } from "vitest"
import { describeFilters } from "@/components/filters/filter-description"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import type { Filters } from "@/lib/types"

const bounds = {
  revenue: { min: 1, max: 716924 },
  yearsInIndia: { min: 0, max: 68 },
  centerIncYear: { min: 1913, max: 2030 },
}

const empty = (): Filters =>
  createDefaultFilters({
    accountHqRevenueRange: [1, 716924],
    accountYearsInIndiaRange: [0, 68],
    centerIncYearRange: [1913, 2030],
  })

describe("describeFilters", () => {
  it("lists nothing when nothing is set", () => {
    expect(describeFilters(empty(), bounds, new Map())).toEqual([])
  })

  it("uses the sidebar's labels and keeps include/exclude", () => {
    const filters = {
      ...empty(),
      accountPrimaryCategoryValues: [{ value: "BFSI", mode: "include" as const }],
      accountHqCountryValues: [{ value: "India", mode: "exclude" as const }],
    }
    const [accounts] = describeFilters(filters, bounds, new Map())
    expect(accounts.section).toBe("accounts")
    expect(accounts.fields.map((f) => f.label)).toEqual(["Industry", "HQ country"])
    expect(accounts.fields[1].values).toEqual([{ value: "India", mode: "exclude" }])
  })

  it("writes ranges in real units and skips an old wide default", () => {
    const narrowed = describeFilters({ ...empty(), accountHqRevenueRange: [1000, 50000] }, bounds, new Map())
    expect(narrowed[0].fields).toEqual([{ label: "HQ revenue", text: "$1B to $50B" }])
    expect(describeFilters({ ...empty(), accountHqRevenueRange: [0, 1000000] }, bounds, new Map())).toEqual([])
  })

  it("names account lists and the accounts switch", () => {
    const filters = {
      ...empty(),
      accountVisibilityMode: "all" as const,
      accountListValues: [{ value: "list-1", mode: "include" as const }],
    }
    const [accounts] = describeFilters(filters, bounds, new Map([["list-1", "Q4 targets"]]))
    expect(accounts.fields).toEqual([
      { label: "Accounts to show", text: "All" },
      { label: "Account list", values: [{ value: "Q4 targets", mode: "include" }] },
    ])
  })
})
