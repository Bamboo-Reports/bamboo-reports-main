import { beforeAll, describe, expect, it } from "vitest"
import { newDb } from "pg-mem"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters, FilterOption, AvailableOptions } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getAvailableOptions } from "@/lib/dashboard/filtering"
import { buildEntityAggregateQuery, type AggregateEntity } from "@/lib/dashboard/filtering-sql"

type Spec = { key: keyof AvailableOptions; entity: AggregateEntity; column: string }
const FACETS: Spec[] = [
  { key: "accountHqRegionValues", entity: "accounts", column: "account_hq_region" },
  { key: "accountHqCountryValues", entity: "accounts", column: "account_hq_country" },
  { key: "accountHqIndustryValues", entity: "accounts", column: "account_hq_industry" },
  { key: "accountDataCoverageValues", entity: "accounts", column: "account_data_coverage" },
  { key: "accountSourceValues", entity: "accounts", column: "account_source" },
  { key: "accountTypeValues", entity: "accounts", column: "account_type" },
  { key: "accountPrimaryCategoryValues", entity: "accounts", column: "account_primary_category" },
  { key: "accountPrimaryNatureValues", entity: "accounts", column: "account_primary_nature" },
  { key: "accountNasscomStatusValues", entity: "accounts", column: "account_nasscom_status" },
  { key: "accountHqEmployeeRangeValues", entity: "accounts", column: "account_hq_employee_range" },
  { key: "accountCenterEmployeesRangeValues", entity: "accounts", column: "account_center_employees_range" },
  { key: "centerTypeValues", entity: "centers", column: "center_type" },
  { key: "centerFocusValues", entity: "centers", column: "center_focus" },
  { key: "centerCityValues", entity: "centers", column: "center_city" },
  { key: "centerStateValues", entity: "centers", column: "center_state" },
  { key: "centerCountryValues", entity: "centers", column: "center_country" },
  { key: "centerEmployeesRangeValues", entity: "centers", column: "center_employees_range" },
  { key: "centerStatusValues", entity: "centers", column: "center_status" },
  { key: "functionNameValues", entity: "functions", column: "function_name" },
  { key: "prospectDepartmentValues", entity: "prospects", column: "prospect_department" },
  { key: "prospectHeadTypeValues", entity: "prospects", column: "head_type" },
  { key: "prospectLevelValues", entity: "prospects", column: "prospect_level" },
  { key: "prospectCityValues", entity: "prospects", column: "prospect_city" },
]

const accounts = [
  ac("Acme", "North America", "United States", "Software", "Full", "Web", "Public", "Technology", "Product", "Yes", "1000-5000", "500-1000", 500000, 5, "include"),
  ac("Beta", "Europe", "Germany", "Automotive", "Partial", "Manual", "Public", "Industrial", "Manufacturing", "No", "5000-10000", "100-500", 0, null, "include"),
  ac("Gamma", "APAC", "India", "Software", "Full", "Web", "Private", "Technology", "Services", "Yes", "100-500", null, null, 10, "exclude"),
  ac("Delta", "North America", "United States", "Finance", "Full", "Web", "Public", "Financial", "Services", "No", "1000-5000", "500-1000", 750000, 2, "include"),
  ac("Zeta", "Europe", "France", "Automotive", "Partial", "Manual", "Private", "Industrial", "Manufacturing", "No", "500-1000", "100-500", 900000, 8, "include"),
] as unknown as Account[]

const centers = [
  ce("c1", "Acme", "Delivery", "IT", "New York", "NY", "United States", "100-500", "Active", 2010),
  ce("c2", "Acme", "R&D", "Engineering", "Austin", "TX", "United States", "50-100", "Upcoming", 2020),
  ce("c3", "Beta", "Delivery", "IT", "Berlin", "BE", "Germany", "100-500", "Active", 2015),
  ce("c4", "Delta", "Support", "Operations", "New York", "NY", "United States", "50-100", "Active", 2012),
  ce("c5", "Zeta", "R&D", "Engineering", "Paris", "IDF", "France", "100-500", "Active", 2018),
  ce("c6", "Gamma", "IT", "IT", "Mumbai", "MH", "India", "1000-5000", "Active", 2011),
] as unknown as Center[]

const functions = [fn("c1", "IT"), fn("c1", "HR"), fn("c2", "IT"), fn("c3", "FnA"), fn("c5", "IT")] as unknown as FnRow[]
const tech: Tech[] = []
const prospects = [
  pr("p1", "Acme", "IT", "IT Head", "Director", "New York"),
  pr("p2", "Acme", "HR", "HR Head", "Manager", "Austin"),
  pr("p3", "Beta", "IT", "IT Head", "VP", "Berlin"),
  pr("p4", "Delta", "Finance", "Finance Head", "Director", "New York"),
  pr("p5", "Zeta", "IT", "IT Head", "Head", "Paris"),
] as unknown as Prospect[]

function ac(name: string, region: string, country: string, industry: string, cov: string, source: string, type: string, cat: string, nature: string, nasscom: string, emp: string, centerEmp: string | null, revenue: number | null, years: number | null, visibility: string) {
  return { account_global_legal_name: name, account_hq_region: region, account_hq_country: country, account_hq_industry: industry, account_data_coverage: cov, account_source: source, account_type: type, account_primary_category: cat, account_primary_nature: nature, account_nasscom_status: nasscom, account_hq_employee_range: emp, account_center_employees_range: centerEmp, account_hq_revenue: revenue, years_in_india: years, account_visibility: visibility }
}
function ce(cn: string, account: string, type: string, focus: string, city: string, state: string, country: string, emp: string, status: string, incYear: number) {
  return { cn_unique_key: cn, account_global_legal_name: account, center_type: type, center_focus: focus, center_city: city, center_state: state, center_country: country, center_employees_range: emp, center_status: status, center_inc_year: incYear }
}
function fn(cn: string, name: string) { return { cn_unique_key: cn, function_name: name } }
function pr(id: string, account: string, dept: string, head: string, level: string, city: string) {
  return { ps_unique_key: id, account_global_legal_name: account, prospect_department: dept, head_type: head, prospect_level: level, prospect_city: city, prospect_title: `${level} of ${dept}` }
}

let pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

async function insert(table: string, cols: string[], rows: Record<string, unknown>[]) {
  for (const r of rows) {
    await pool.query(`insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => r[c] ?? null))
  }
}

beforeAll(async () => {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  pool = new Pool()
  await pool.query(`create table accounts (account_global_legal_name text, account_hq_region text, account_hq_country text, account_hq_industry text, account_data_coverage text, account_source text, account_type text, account_primary_category text, account_primary_nature text, account_nasscom_status text, account_hq_employee_range text, account_center_employees_range text, account_hq_revenue bigint, years_in_india int, account_visibility text)`)
  await pool.query(`create table centers (cn_unique_key text, account_global_legal_name text, center_type text, center_focus text, center_city text, center_state text, center_country text, center_employees_range text, center_status text, center_inc_year int)`)
  await pool.query(`create table functions (cn_unique_key text, function_name text)`)
  await pool.query(`create table tech (cn_unique_key text, software_in_use text)`)
  await pool.query(`create table prospects (ps_unique_key text, account_global_legal_name text, prospect_department text, head_type text, prospect_level text, prospect_city text, prospect_title text)`)
  const accCols = ["account_global_legal_name", "account_hq_region", "account_hq_country", "account_hq_industry", "account_data_coverage", "account_source", "account_type", "account_primary_category", "account_primary_nature", "account_nasscom_status", "account_hq_employee_range", "account_center_employees_range", "account_hq_revenue", "years_in_india", "account_visibility"]
  const cenCols = ["cn_unique_key", "account_global_legal_name", "center_type", "center_focus", "center_city", "center_state", "center_country", "center_employees_range", "center_status", "center_inc_year"]
  await insert("accounts", accCols, accounts as unknown as Record<string, unknown>[])
  await insert("centers", cenCols, centers as unknown as Record<string, unknown>[])
  await insert("functions", ["cn_unique_key", "function_name"], functions as unknown as Record<string, unknown>[])
  await insert("prospects", ["ps_unique_key", "account_global_legal_name", "prospect_department", "head_type", "prospect_level", "prospect_city", "prospect_title"], prospects as unknown as Record<string, unknown>[])
})

const norm = (opts: FilterOption[]) =>
  [...opts].map((o) => ({ value: o.value, count: o.count })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))

async function sqlFacet(filters: Filters, spec: Spec): Promise<FilterOption[]> {
  const active = ((filters[spec.key as keyof Filters] as { length?: number } | undefined)?.length ?? 0) > 0
  const ff = active ? ({ ...filters, [spec.key]: [] } as Filters) : filters
  const value = `coalesce(${spec.column}, '')`
  const q = buildEntityAggregateQuery(spec.entity, ff, {}, `${value} as value, count(*)::int as count`, { groupBy: value, materialized: false })
  const rows = (await pool.query(q.text, q.values)).rows as { value: string | null; count: number }[]
  return rows.map((r) => ({ value: String(r.value ?? ""), count: Number(r.count) }))
}

async function assertFacets(overrides: Partial<Filters>) {
  const filters = createDefaultFilters({ accountHqRevenueRange: [0, Number.MAX_SAFE_INTEGER], ...overrides })
  const engine = getAvailableOptions(accounts, centers, functions, prospects, tech, filters, {})
  for (const spec of FACETS) {
    const sql = await sqlFacet(filters, spec)
    expect(norm(sql), spec.key).toEqual(norm(engine[spec.key]))
  }
}

describe("facets parity with getAvailableOptions", () => {
  const inc = (...v: string[]) => v.map((value) => ({ value, mode: "include" as const }))
  const scenarios: Array<[string, Partial<Filters>]> = [
    ["base (gcc)", {}],
    ["visibility all", { accountVisibilityMode: "all" }],
    ["country active (self-exclude)", { accountHqCountryValues: inc("United States") }],
    ["center city active", { accountVisibilityMode: "all", centerCityValues: inc("New York") }],
    ["prospect dept active (cascade)", { accountVisibilityMode: "all", prospectDepartmentValues: inc("IT") }],
  ]
  for (const [name, overrides] of scenarios) {
    it(name, async () => {
      await assertFacets(overrides)
    })
  }
})
