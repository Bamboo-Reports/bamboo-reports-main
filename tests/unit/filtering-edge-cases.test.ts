import { describe, expect, it } from "vitest"
import { getFilteredData, getAccountNames } from "@/lib/dashboard/filtering"
import {
  makeAccount,
  makeCenter,
  makeFilters,
  makeFunction,
  makeProspect,
  makeService,
  makeTech,
} from "../fixtures/domain"

const NO_CENTERS = { centersEnabled: false } as const

describe("getFilteredData edge cases", () => {
  it("returns empty results for empty input", () => {
    const result = getFilteredData([], [], [], [], [], [], makeFilters(), { centersEnabled: false })
    expect(result.filteredAccounts).toEqual([])
    expect(result.filteredCenters).toEqual([])
    expect(result.filteredFunctions).toEqual([])
    expect(result.filteredServices).toEqual([])
    expect(result.filteredProspects).toEqual([])
    expect(result.explicitExcludedSelected).toBe(false)
  })

  it("applies keyword name filter on accounts", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Acme Corp" }),
      makeAccount({ account_global_legal_name: "Beta LLC" }),
    ]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({
        accountVisibilityMode: "all",
        accountGlobalLegalNameKeywords: [{ value: "Acme", mode: "include" }],
      }),
      NO_CENTERS
    )
    expect(result.filteredAccounts).toHaveLength(1)
    expect(result.filteredAccounts[0].account_global_legal_name).toBe("Acme Corp")
  })

  it("excludes accounts by keyword name filter", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Acme Corp" }),
      makeAccount({ account_global_legal_name: "Beta LLC" }),
    ]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({
        accountVisibilityMode: "all",
        accountGlobalLegalNameKeywords: [{ value: "Acme", mode: "exclude" }],
      }),
      NO_CENTERS
    )
    expect(result.filteredAccounts).toHaveLength(1)
    expect(result.filteredAccounts[0].account_global_legal_name).toBe("Beta LLC")
  })

  it("allows all visibility mode to include both GCC and non-GCC accounts", () => {
    const accounts = [
      makeAccount({ account_visibility: "include" }),
      makeAccount({ account_visibility: "exclude", account_global_legal_name: "Beta LLC" }),
    ]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all" }),
      NO_CENTERS
    )
    expect(result.filteredAccounts).toHaveLength(2)
  })

  it("detects explicit excluded selection", () => {
    const accounts = [makeAccount({ account_visibility: "exclude" })]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all" }),
      NO_CENTERS
    )
    expect(result.explicitExcludedSelected).toBe(true)
  })

  it("applies account revenue range filter", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: 500 }),
      makeAccount({ account_hq_revenue: 5000, account_global_legal_name: "Beta LLC" }),
    ]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all", accountHqRevenueRange: [1000, 10000] as [number, number] }),
      NO_CENTERS
    )
    expect(result.filteredAccounts).toHaveLength(1)
    expect(result.filteredAccounts[0].account_global_legal_name).toBe("Beta LLC")
  })

  it("applies years-in-india range filter", () => {
    const accounts = [
      makeAccount({ years_in_india: 5 }),
      makeAccount({ years_in_india: 15, account_global_legal_name: "Beta LLC" }),
    ]
    const result = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all", accountYearsInIndiaRange: [10, 20] as [number, number] }),
      NO_CENTERS
    )
    expect(result.filteredAccounts).toHaveLength(1)
  })

  it("applies center software keyword filter", () => {
    const centers = [makeCenter({ cn_unique_key: "CN-1" })]
    const tech = [makeTech({ cn_unique_key: "CN-1", software_in_use: "Salesforce CRM" })]
    const result = getFilteredData(
      [makeAccount()],
      centers,
      [],
      [],
      [],
      tech,
      makeFilters({ techSoftwareInUseKeywords: [{ value: "Oracle", mode: "include" }] })
    )
    expect(result.filteredCenters).toHaveLength(0)
  })

  it("cascades account filters to centers and prospects", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Acme Corp", account_hq_country: "India" }),
      makeAccount({ account_global_legal_name: "Beta LLC", account_hq_country: "USA" }),
    ]
    const centers = [
      makeCenter({ account_global_legal_name: "Acme Corp", cn_unique_key: "CN-1" }),
      makeCenter({ account_global_legal_name: "Beta LLC", cn_unique_key: "CN-2" }),
    ]
    const prospects = [
      makeProspect({ account_global_legal_name: "Acme Corp" }),
      makeProspect({ account_global_legal_name: "Beta LLC", prospect_full_name: "Grace Hopper" }),
    ]
    const result = getFilteredData(
      accounts,
      centers,
      [],
      [],
      prospects,
      [],
      makeFilters({ accountHqCountryValues: [{ value: "India", mode: "include" }] })
    )
    expect(result.filteredAccounts).toHaveLength(1)
    expect(result.filteredCenters).toHaveLength(1)
    expect(result.filteredProspects).toHaveLength(1)
    expect(result.filteredProspects[0].prospect_full_name).toBe("Ada Lovelace")
  })

  it("cascades prospect filters back to accounts and centers", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Acme Corp" }),
      makeAccount({ account_global_legal_name: "Beta LLC" }),
    ]
    const centers = [
      makeCenter({ account_global_legal_name: "Acme Corp", cn_unique_key: "CN-1" }),
      makeCenter({ account_global_legal_name: "Beta LLC", cn_unique_key: "CN-2" }),
    ]
    const prospects = [
      makeProspect({ account_global_legal_name: "Acme Corp", prospect_department: "Engineering" }),
      makeProspect({ account_global_legal_name: "Beta LLC", prospect_department: "Finance" }),
    ]
    const result = getFilteredData(
      accounts,
      centers,
      [],
      [],
      prospects,
      [],
      makeFilters({ prospectDepartmentValues: [{ value: "Finance", mode: "include" }] })
    )
    expect(result.filteredAccounts).toHaveLength(1)
    expect(result.filteredAccounts[0].account_global_legal_name).toBe("Beta LLC")
    expect(result.filteredCenters).toHaveLength(1)
    expect(result.filteredCenters[0].cn_unique_key).toBe("CN-2")
  })

  it("disables centers when centersEnabled is false", () => {
    const accounts = [makeAccount()]
    const centers = [makeCenter()]
    const result = getFilteredData(accounts, centers, [], [], [], [], makeFilters(), { centersEnabled: false })
    expect(result.filteredCenters).toHaveLength(0)
    expect(result.filteredFunctions).toEqual([])
    expect(result.filteredServices).toEqual([])
  })

  it("disables prospects when prospectsEnabled is false", () => {
    const accounts = [makeAccount()]
    const prospects = [makeProspect()]
    const result = getFilteredData(accounts, [], [], [], prospects, [], makeFilters(), {
      centersEnabled: false,
      prospectsEnabled: false,
    })
    expect(result.filteredProspects).toEqual([])
  })

  it("handles range filter with includeNull toggle", () => {
    const accounts = [
      makeAccount({ account_hq_revenue: null }),
      makeAccount({ account_hq_revenue: 500, account_global_legal_name: "Beta LLC" }),
    ]
    const withNull = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all", accountHqRevenueIncludeNull: true }),
      NO_CENTERS
    )
    expect(withNull.filteredAccounts).toHaveLength(2)

    const withoutNull = getFilteredData(
      accounts,
      [],
      [],
      [],
      [],
      [],
      makeFilters({ accountVisibilityMode: "all", accountHqRevenueIncludeNull: false }),
      NO_CENTERS
    )
    expect(withoutNull.filteredAccounts).toHaveLength(1)
  })
})

describe("getAccountNames", () => {
  it("returns unique account names preserving insertion order", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Beta LLC" }),
      makeAccount({ account_global_legal_name: "Acme Corp" }),
      makeAccount({ account_global_legal_name: "Acme Corp" }),
    ]
    const names = getAccountNames(accounts)
    expect(names).toEqual(["Beta LLC", "Acme Corp"])
  })

  it("handles empty input", () => {
    expect(getAccountNames([])).toEqual([])
  })

  it("filters out empty names", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "" }),
      makeAccount({ account_global_legal_name: "Acme Corp" }),
    ]
    expect(getAccountNames(accounts)).toEqual(["Acme Corp"])
  })
})
