import { beforeAll, describe, expect, it } from "vitest"
import { newDb } from "pg-mem"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData, type FilteredData } from "@/lib/dashboard/filtering"
import {
  buildAccountsQuery,
  buildCentersQuery,
  buildProspectsQuery,
  type FilterAccess,
} from "@/lib/dashboard/filtering-sql"

// ---------------------------------------------------------------------------
// Fixtures (deliberately varied: null values, exclude/include visibility,
// accounts with no centers, centers with no prospects, mixed ranges).
// ---------------------------------------------------------------------------

const accounts = [
  a("Acme Corp", { region: "North America", country: "United States", industry: "Software", dataCoverage: "Full", source: "Web", type: "Public", primaryCategory: "Technology", primaryNature: "Product", nasscom: "Yes", empRange: "1000-5000", centerEmpRange: "500-1000", revenue: 500000, years: 5, visibility: "include" }),
  a("Beta Auto AG", { region: "Europe", country: "Germany", industry: "Automotive", dataCoverage: "Partial", source: "Manual", type: "Public", primaryCategory: "Industrial", primaryNature: "Manufacturing", nasscom: "No", empRange: "5000-10000", centerEmpRange: "100-500", revenue: 0, years: null, visibility: "include" }),
  a("Gamma Systems", { region: "APAC", country: "India", industry: "Software", dataCoverage: "Full", source: "Web", type: "Private", primaryCategory: "Technology", primaryNature: "Services", nasscom: "Yes", empRange: "100-500", centerEmpRange: null, revenue: null, years: 10, visibility: "exclude" }),
  a("Delta Finance", { region: "North America", country: "United States", industry: "Finance", dataCoverage: "Full", source: "Web", type: "Public", primaryCategory: "Financial", primaryNature: "Services", nasscom: "No", empRange: "1000-5000", centerEmpRange: "500-1000", revenue: 750000, years: 2, visibility: "include" }),
  a("Epsilon Null", { region: null, country: null, industry: null, dataCoverage: null, source: null, type: null, primaryCategory: null, primaryNature: null, nasscom: null, empRange: null, centerEmpRange: null, revenue: 200000, years: null, visibility: null }),
  a("Global Auto GmbH", { region: "Europe", country: "France", industry: "Automotive", dataCoverage: "Partial", source: "Manual", type: "Private", primaryCategory: "Industrial", primaryNature: "Manufacturing", nasscom: "No", empRange: "500-1000", centerEmpRange: "100-500", revenue: 900000, years: 8, visibility: "exclude" }),
] as unknown as Account[]

const centers = [
  c("c1", "Acme Corp", { type: "Delivery", focus: "IT", city: "New York", state: "NY", country: "United States", empRange: "100-500", status: "Active", incYear: 2010 }),
  c("c2", "Acme Corp", { type: "RnD", focus: "Engineering", city: "Austin", state: "TX", country: "United States", empRange: "50-100", status: "Upcoming", incYear: 2020 }),
  c("c3", "Beta Auto AG", { type: "Delivery", focus: "IT", city: "Berlin", state: "BE", country: "Germany", empRange: "100-500", status: "Active", incYear: 2015 }),
  c("c4", "Delta Finance", { type: "Support", focus: "Operations", city: "New York", state: "NY", country: "United States", empRange: "50-100", status: "Active", incYear: null }),
  c("c5", "Global Auto GmbH", { type: "RnD", focus: "Engineering", city: "Paris", state: "IDF", country: "France", empRange: "100-500", status: "Active", incYear: 2018 }),
] as unknown as Center[]

const functions = [
  fn("c1", "IT Services"),
  fn("c1", "Engineering"),
  fn("c2", "Engineering"),
  fn("c3", "IT Services"),
  fn("c5", "Finance"),
] as unknown as FnRow[]

const tech = [
  t("c1", "Salesforce CRM"),
  t("c1", "SAP ERP"),
  t("c2", "Oracle Database"),
  t("c3", "Workday"),
  t("c4", null),
  t("c5", "SAP ERP"),
] as unknown as Tech[]

const prospects = [
  pr("p1", "Acme Corp", { dept: "Engineering", head: "CXO", level: "C-Level", city: "New York", title: "VP Engineering" }),
  pr("p2", "Acme Corp", { dept: "Sales", head: "Manager", level: "Mid", city: "Austin", title: "Sales Manager" }),
  pr("p3", "Beta Auto AG", { dept: "Engineering", head: "CXO", level: "C-Level", city: "Berlin", title: "Chief Technology Officer" }),
  pr("p4", "Delta Finance", { dept: "Finance", head: "CXO", level: "C-Level", city: "New York", title: "Chief Financial Officer" }),
  pr("p5", "Global Auto GmbH", { dept: "Engineering", head: "Head", level: "Senior", city: "Paris", title: "Head of Engineering" }),
  pr("p6", "Gamma Systems", { dept: "HR", head: "Head", level: "Senior", city: "Mumbai", title: "HR Head" }),
] as unknown as Prospect[]

function a(name: string, o: Record<string, unknown>) {
  return {
    account_global_legal_name: name,
    account_hq_region: o.region, account_hq_country: o.country, account_hq_industry: o.industry,
    account_data_coverage: o.dataCoverage, account_source: o.source, account_type: o.type,
    account_primary_category: o.primaryCategory, account_primary_nature: o.primaryNature,
    account_nasscom_status: o.nasscom, account_hq_employee_range: o.empRange,
    account_center_employees_range: o.centerEmpRange, account_hq_revenue: o.revenue,
    years_in_india: o.years, account_visibility: o.visibility,
  }
}
function c(cn: string, account: string, o: Record<string, unknown>) {
  return {
    cn_unique_key: cn, account_global_legal_name: account, center_type: o.type, center_focus: o.focus,
    center_city: o.city, center_state: o.state, center_country: o.country,
    center_employees_range: o.empRange, center_status: o.status, center_inc_year: o.incYear,
  }
}
function fn(cn: string, name: string) {
  return { cn_unique_key: cn, function_name: name }
}
function t(cn: string, sw: string | null) {
  return { cn_unique_key: cn, software_in_use: sw }
}
function pr(id: string, account: string, o: Record<string, unknown>) {
  return {
    ps_unique_key: id, account_global_legal_name: account, prospect_department: o.dept,
    head_type: o.head, prospect_level: o.level, prospect_city: o.city, prospect_title: o.title,
  }
}

// ---------------------------------------------------------------------------
// pg-mem setup
// ---------------------------------------------------------------------------

let pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

async function insertRows(table: string, cols: string[], rows: Record<string, unknown>[]) {
  for (const row of rows) {
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ")
    await pool.query(`insert into ${table} (${cols.join(", ")}) values (${placeholders})`, cols.map((c) => row[c] ?? null))
  }
}

beforeAll(async () => {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  pool = new Pool()

  await pool.query(`create table accounts (
    account_global_legal_name text, account_hq_region text, account_hq_country text, account_hq_industry text,
    account_data_coverage text, account_source text, account_type text, account_primary_category text,
    account_primary_nature text, account_nasscom_status text, account_hq_employee_range text,
    account_center_employees_range text, account_hq_revenue bigint, years_in_india int, account_visibility text)`)
  await pool.query(`create table centers (
    cn_unique_key text, account_global_legal_name text, center_type text, center_focus text, center_city text,
    center_state text, center_country text, center_employees_range text, center_status text, center_inc_year int)`)
  await pool.query(`create table functions (cn_unique_key text, function_name text)`)
  await pool.query(`create table tech (cn_unique_key text, software_in_use text)`)
  await pool.query(`create table prospects (
    ps_unique_key text, account_global_legal_name text, prospect_department text, head_type text,
    prospect_level text, prospect_city text, prospect_title text)`)

  await insertRows("accounts", ["account_global_legal_name", "account_hq_region", "account_hq_country", "account_hq_industry", "account_data_coverage", "account_source", "account_type", "account_primary_category", "account_primary_nature", "account_nasscom_status", "account_hq_employee_range", "account_center_employees_range", "account_hq_revenue", "years_in_india", "account_visibility"], accounts as unknown as Record<string, unknown>[])
  await insertRows("centers", ["cn_unique_key", "account_global_legal_name", "center_type", "center_focus", "center_city", "center_state", "center_country", "center_employees_range", "center_status", "center_inc_year"], centers as unknown as Record<string, unknown>[])
  await insertRows("functions", ["cn_unique_key", "function_name"], functions as unknown as Record<string, unknown>[])
  await insertRows("tech", ["cn_unique_key", "software_in_use"], tech as unknown as Record<string, unknown>[])
  await insertRows("prospects", ["ps_unique_key", "account_global_legal_name", "prospect_department", "head_type", "prospect_level", "prospect_city", "prospect_title"], prospects as unknown as Record<string, unknown>[])
})

// ---------------------------------------------------------------------------
// Parity helper
// ---------------------------------------------------------------------------

const sorted = (xs: unknown[]) => xs.map(String).sort()

async function sqlIds(query: { text: string; values: unknown[] }, key: string) {
  const res = await pool.query(query.text, query.values)
  return sorted(res.rows.map((r) => r[key]))
}

async function assertParity(name: string, overrides: Partial<Filters>, access: FilterAccess = {}) {
  const filters = createDefaultFilters(overrides)
  const expected: FilteredData = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, access)

  // pg-mem does not parse `AS MATERIALIZED` (a pure planner hint), so turn it
  // off here. Results are identical; production defaults it on for the planner.
  const o = { orderBy: null, materialized: false } as const
  const sqlAccounts = await sqlIds(buildAccountsQuery(filters, access, o), "account_global_legal_name")
  const sqlCenters = await sqlIds(buildCentersQuery(filters, access, o), "cn_unique_key")
  const sqlProspects = await sqlIds(buildProspectsQuery(filters, access, o), "ps_unique_key")

  expect(sqlAccounts, `${name} :: accounts`).toEqual(sorted(expected.filteredAccounts.map((x) => x.account_global_legal_name)))
  expect(sqlCenters, `${name} :: centers`).toEqual(sorted(expected.filteredCenters.map((x) => x.cn_unique_key)))
  expect(sqlProspects, `${name} :: prospects`).toEqual(sorted(expected.filteredProspects.map((x) => x.ps_unique_key)))
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const inc = (...vs: string[]) => vs.map((value) => ({ value, mode: "include" as const }))
const exc = (...vs: string[]) => vs.map((value) => ({ value, mode: "exclude" as const }))
const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

describe("filtering-sql parity with getFilteredData", () => {
  const scenarios: Array<[string, Partial<Filters>, FilterAccess?]> = [
    ["defaults (gcc)", {}],
    ["visibility all", { accountVisibilityMode: "all" }],
    ["visibility nonGcc", { accountVisibilityMode: "nonGcc" }],
    ["country include", { accountHqCountryValues: inc("United States") }],
    ["country exclude", { accountHqCountryValues: exc("United States"), accountVisibilityMode: "all" }],
    ["industry include multi", { accountHqIndustryValues: inc("Software", "Finance") }],
    ["region include + country exclude", { accountHqRegionValues: inc("North America"), accountHqCountryValues: exc("United States"), accountVisibilityMode: "all" }],
    ["revenue narrow, excl null", { accountHqRevenueRange: [100000, 600000], accountHqRevenueIncludeNull: false }],
    ["revenue narrow, incl null", { accountHqRevenueRange: [600000, 800000], accountHqRevenueIncludeNull: true }],
    ["years range", { accountYearsInIndiaRange: [3, 20], yearsInIndiaIncludeNull: false }],
    ["name keyword (visibility bypass)", { accountGlobalLegalNameKeywords: inc("global") }],
    ["name keyword exclude", { accountGlobalLegalNameKeywords: exc("auto"), accountVisibilityMode: "all" }],
    ["center type include", { centerTypeValues: inc("RnD"), accountVisibilityMode: "all" }],
    ["center city + account country", { accountHqCountryValues: inc("United States"), centerCityValues: inc("New York") }],
    ["center inc year range", { centerIncYearRange: [2012, 2019], centerIncYearIncludeNull: false, accountVisibilityMode: "all" }],
    ["function (services offered)", { functionNameValues: inc("Engineering"), accountVisibilityMode: "all" }],
    ["software include", { techSoftwareInUseKeywords: inc("sap"), accountVisibilityMode: "all" }],
    ["software exclude", { techSoftwareInUseKeywords: exc("oracle"), accountVisibilityMode: "all" }],
    ["prospect department (cascade up)", { prospectDepartmentValues: inc("Engineering"), accountVisibilityMode: "all" }],
    ["prospect title keyword", { prospectTitleKeywords: inc("chief"), accountVisibilityMode: "all" }],
    ["prospect + account combined", { accountHqCountryValues: inc("United States"), prospectLevelValues: inc("C-Level") }],
    ["center employees range (coalesceEmpty)", { accountCenterEmployeesRangeValues: inc("500-1000") }],
    ["center employees exclude (null passes)", { accountCenterEmployeesRangeValues: exc("100-500"), accountVisibilityMode: "all" }],
    ["employee range include", { accountHqEmployeeRangeValues: inc("1000-5000") }],
    ["everything combined", { accountVisibilityMode: "all", accountHqCountryValues: inc("United States"), centerCityValues: inc("New York"), prospectDepartmentValues: inc("Engineering", "Finance"), accountHqRevenueRange: WIDE }],
    ["centers disabled", { accountHqCountryValues: inc("United States") }, { centersEnabled: false }],
    ["prospects disabled with prospect filter", { prospectDepartmentValues: inc("Engineering"), accountVisibilityMode: "all" }, { prospectsEnabled: false }],
    ["accounts disabled", { accountVisibilityMode: "all" }, { accountsEnabled: false }],
  ]

  for (const [name, overrides, access] of scenarios) {
    it(name, async () => {
      await assertParity(name, overrides, access)
    })
  }
})

// ---------------------------------------------------------------------------
// Deterministic fuzz: generate many random filter combinations (seeded LCG,
// no Math.random) and assert SQL == engine for each.
// ---------------------------------------------------------------------------

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const POOLS = {
  region: ["North America", "Europe", "APAC", "Antarctica"],
  country: ["United States", "Germany", "India", "France", "Narnia"],
  industry: ["Software", "Automotive", "Finance", "Mining"],
  dataCoverage: ["Full", "Partial", "None"],
  source: ["Web", "Manual", "Api"],
  type: ["Public", "Private", "NGO"],
  primaryCategory: ["Technology", "Industrial", "Financial", "Retail"],
  primaryNature: ["Product", "Manufacturing", "Services"],
  nasscom: ["Yes", "No"],
  empRange: ["1000-5000", "5000-10000", "100-500", "500-1000"],
  centerEmpRange: ["500-1000", "100-500", ""],
  nameKw: ["acme", "auto", "systems", "global", "zzz"],
  centerType: ["Delivery", "RnD", "Support", "Sales"],
  centerFocus: ["IT", "Engineering", "Operations"],
  centerCity: ["New York", "Austin", "Berlin", "Paris", "Mumbai"],
  centerState: ["NY", "TX", "BE", "IDF"],
  centerCountry: ["United States", "Germany", "France"],
  centerEmp: ["100-500", "50-100"],
  centerStatus: ["Active", "Upcoming"],
  fn: ["IT Services", "Engineering", "Finance", "HR"],
  software: ["sap", "oracle", "crm", "workday", "zzz"],
  dept: ["Engineering", "Sales", "Finance", "HR"],
  head: ["CXO", "Manager", "Head"],
  level: ["C-Level", "Mid", "Senior"],
  prospectCity: ["New York", "Austin", "Berlin", "Paris", "Mumbai"],
  titleKw: ["chief", "engineering", "manager", "officer", "head"],
}

describe("filtering-sql parity fuzz (seeded)", () => {
  const N = 150
  const rand = lcg(0xc0ffee)
  const pick = (pool: string[]) => pool[Math.floor(rand() * pool.length)]
  const maybeValues = (pool: string[], prob = 0.28) => {
    if (rand() > prob) return undefined
    const mode = rand() < 0.5 ? ("include" as const) : ("exclude" as const)
    const count = 1 + Math.floor(rand() * 2)
    const values = new Set<string>()
    for (let i = 0; i < count; i++) values.add(pick(pool))
    return [...values].map((value) => ({ value, mode }))
  }

  const cases: Array<[string, Partial<Filters>]> = []
  for (let i = 0; i < N; i++) {
    const o: Partial<Filters> = {}
    o.accountVisibilityMode = pick(["all", "gcc", "nonGcc"]) as Filters["accountVisibilityMode"]
    const set = <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
      if (v !== undefined) o[k] = v
    }
    set("accountHqRegionValues", maybeValues(POOLS.region))
    set("accountHqCountryValues", maybeValues(POOLS.country))
    set("accountHqIndustryValues", maybeValues(POOLS.industry))
    set("accountDataCoverageValues", maybeValues(POOLS.dataCoverage))
    set("accountSourceValues", maybeValues(POOLS.source))
    set("accountTypeValues", maybeValues(POOLS.type))
    set("accountPrimaryCategoryValues", maybeValues(POOLS.primaryCategory))
    set("accountPrimaryNatureValues", maybeValues(POOLS.primaryNature))
    set("accountNasscomStatusValues", maybeValues(POOLS.nasscom))
    set("accountHqEmployeeRangeValues", maybeValues(POOLS.empRange))
    set("accountCenterEmployeesRangeValues", maybeValues(POOLS.centerEmpRange))
    set("accountGlobalLegalNameKeywords", maybeValues(POOLS.nameKw, 0.2))
    set("centerTypeValues", maybeValues(POOLS.centerType))
    set("centerFocusValues", maybeValues(POOLS.centerFocus))
    set("centerCityValues", maybeValues(POOLS.centerCity))
    set("centerStateValues", maybeValues(POOLS.centerState))
    set("centerCountryValues", maybeValues(POOLS.centerCountry))
    set("centerEmployeesRangeValues", maybeValues(POOLS.centerEmp))
    set("centerStatusValues", maybeValues(POOLS.centerStatus))
    set("functionNameValues", maybeValues(POOLS.fn))
    set("techSoftwareInUseKeywords", maybeValues(POOLS.software, 0.2))
    set("prospectDepartmentValues", maybeValues(POOLS.dept))
    set("prospectHeadTypeValues", maybeValues(POOLS.head))
    set("prospectLevelValues", maybeValues(POOLS.level))
    set("prospectCityValues", maybeValues(POOLS.prospectCity))
    set("prospectTitleKeywords", maybeValues(POOLS.titleKw, 0.2))
    if (rand() < 0.3) {
      const lo = Math.floor(rand() * 800000)
      o.accountHqRevenueRange = [lo, lo + Math.floor(rand() * 400000)]
      o.accountHqRevenueIncludeNull = rand() < 0.5
    }
    if (rand() < 0.2) {
      const lo = 2005 + Math.floor(rand() * 15)
      o.centerIncYearRange = [lo, lo + Math.floor(rand() * 10)]
      o.centerIncYearIncludeNull = rand() < 0.5
    }
    cases.push([`fuzz #${i}`, o])
  }

  for (const [name, overrides] of cases) {
    it(name, async () => {
      await assertParity(name, overrides)
    })
  }
})
