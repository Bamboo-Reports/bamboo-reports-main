import { describe, expect, it } from "vitest"
import { getAvailableOptions, getDynamicRevenueRange, getFilteredData } from "@/lib/dashboard/filtering"
import {
  fv,
  makeAccount,
  makeCenter,
  makeFilters,
  makeFunction,
  makeProspect,
  makeService,
  makeTech,
} from "../fixtures/domain"

describe("dashboard filtering", () => {
  const accounts = [
    makeAccount({ account_global_legal_name: "Acme Corp", account_hq_country: "India", account_visibility: "include", account_hq_revenue: 1000 }),
    makeAccount({ account_global_legal_name: "Beta LLC", account_hq_country: "USA", account_visibility: "exclude", account_hq_revenue: 2000 }),
  ]
  const centers = [
    makeCenter({ account_global_legal_name: "Acme Corp", cn_unique_key: "CN-1", center_city: "Bengaluru" }),
    makeCenter({ account_global_legal_name: "Beta LLC", cn_unique_key: "CN-2", center_city: "Pune" }),
  ]
  const functions = [
    makeFunction({ cn_unique_key: "CN-1", function_name: "Engineering" }),
    makeFunction({ cn_unique_key: "CN-2", function_name: "Finance" }),
  ]
  const services = [
    makeService({ cn_unique_key: "CN-1", primary_service: "Product" }),
    makeService({ cn_unique_key: "CN-2", primary_service: "Finance" }),
  ]
  const prospects = [
    makeProspect({ account_global_legal_name: "Acme Corp", prospect_full_name: "Ada Lovelace", prospect_department: "Engineering", prospect_title: "VP Engineering" }),
    makeProspect({ account_global_legal_name: "Beta LLC", prospect_full_name: "Grace Hopper", prospect_department: "Finance", prospect_title: "CFO" }),
  ]
  const tech = [
    makeTech({ cn_unique_key: "CN-1", software_in_use: "Salesforce" }),
    makeTech({ cn_unique_key: "CN-2", software_in_use: "SAP" }),
  ]

  it("defaults to GCC-visible accounts and cascades to related rows", () => {
    const result = getFilteredData(accounts, centers, functions, services, prospects, tech, makeFilters())
    expect(result.filteredAccounts.map((a) => a.account_global_legal_name)).toEqual(["Acme Corp"])
    expect(result.filteredCenters.map((c) => c.cn_unique_key)).toEqual(["CN-1"])
    expect(result.filteredFunctions.map((f) => f.function_name)).toEqual(["Engineering"])
    expect(result.filteredServices.map((s) => s.primary_service)).toEqual(["Product"])
    expect(result.filteredProspects.map((p) => p.prospect_full_name)).toEqual(["Ada Lovelace"])
    expect(result.explicitExcludedSelected).toBe(false)
  })

  it("can explicitly include non-GCC accounts and flags excluded visibility rows", () => {
    const result = getFilteredData(
      accounts,
      centers,
      functions,
      services,
      prospects,
      tech,
      makeFilters({ accountVisibilityMode: "nonGcc" })
    )
    expect(result.filteredAccounts.map((a) => a.account_global_legal_name)).toEqual(["Beta LLC"])
    expect(result.explicitExcludedSelected).toBe(true)
  })

  it("applies account, center, function, tech, and prospect filters together", () => {
    const result = getFilteredData(
      accounts,
      centers,
      functions,
      services,
      prospects,
      tech,
      makeFilters({
        accountVisibilityMode: "all",
        accountHqCountryValues: [fv("India")],
        centerCityValues: [fv("Bengaluru")],
        functionNameValues: [fv("Engineering")],
        techSoftwareInUseKeywords: [fv("sales")],
        prospectTitleKeywords: [fv("vp")],
      })
    )
    expect(result.filteredAccounts.map((a) => a.account_global_legal_name)).toEqual(["Acme Corp"])
    expect(result.filteredCenters.map((c) => c.cn_unique_key)).toEqual(["CN-1"])
    expect(result.filteredProspects.map((p) => p.prospect_full_name)).toEqual(["Ada Lovelace"])
  })

  it("can disable sections through access configuration", () => {
    const result = getFilteredData(accounts, centers, functions, services, prospects, tech, makeFilters(), {
      accountsEnabled: false,
      centersEnabled: true,
      prospectsEnabled: false,
    })
    expect(result.filteredAccounts).toEqual([])
    expect(result.filteredProspects).toEqual([])
    expect(result.filteredCenters.map((c) => c.cn_unique_key)).toEqual(["CN-1"])
  })

  it("calculates dynamic revenue range after non-revenue filters", () => {
    const range = getDynamicRevenueRange(
      accounts,
      makeFilters({ accountVisibilityMode: "all", accountHqCountryValues: [fv("USA")] })
    )
    expect(range).toEqual({ min: 2000, max: 2000 })
  })

  it("computes available option counts while unscoping the active facet", () => {
    const options = getAvailableOptions(
      accounts,
      centers,
      functions,
      prospects,
      tech,
      makeFilters({ accountVisibilityMode: "all", accountHqCountryValues: [fv("India")] })
    )
    expect(options.accountHqCountryValues).toEqual([
      { value: "India", count: 1 },
      { value: "USA", count: 1 },
    ])
    expect(options.centerCityValues).toEqual([{ value: "Bengaluru", count: 1 }])
  })

  it("handles prospectsEnabled isolated selection logic", () => {
    const result = getFilteredData(
      accounts,
      centers,
      functions,
      services,
      prospects,
      tech,
      makeFilters({ prospectDepartmentValues: [fv("Engineering")] }),
      { accountsEnabled: false, centersEnabled: false, prospectsEnabled: true }
    )
    expect(result.filteredAccounts).toEqual([])
    expect(result.filteredCenters).toEqual([])
    expect(result.filteredProspects.map(p => p.prospect_full_name)).toEqual(["Ada Lovelace"])
  })

  it("handles dynamic revenue range with no matching accounts", () => {
    const range = getDynamicRevenueRange(
      [],
      makeFilters()
    )
    expect(range).toEqual({ min: 0, max: 1000000 })
  })
})
