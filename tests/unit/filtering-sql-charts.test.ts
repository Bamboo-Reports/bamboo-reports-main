import { beforeAll, describe, expect, it } from "vitest"
import { newDb } from "pg-mem"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildEntityAggregateQuery, type AggregateEntity } from "@/lib/dashboard/filtering-sql"

// Verifies the grouped-count SQL (with the "Unknown" coercion + cascade) matches
// the engine's chart counting. The top-10 / city-Others bucketing is pure JS and
// covered by the route test.

const accounts = [
  a("Acme", { country: "United States", category: "Technology", revRange: "1B-5B", cEmp: "500-1000", visibility: "include" }),
  a("Beta", { country: "Germany", category: "Industrial", revRange: "5B-10B", cEmp: "100-500", visibility: "include" }),
  a("Gamma", { country: "India", category: "Technology", revRange: null, cEmp: null, visibility: "exclude" }),
  a("Delta", { country: "United States", category: "Financial", revRange: "1B-5B", cEmp: "500-1000", visibility: "include" }),
  a("Zeta", { country: "United States", category: "Technology", revRange: "5B-10B", cEmp: "100-500", visibility: "include" }),
] as unknown as Account[]

const centers = [
  c("c1", "Acme", { type: "IT", emp: "100-500", city: "New York", incYear: 2010 }),
  c("c2", "Acme", { type: "R&D", emp: "50-100", city: "Austin", incYear: 2020 }),
  c("c3", "Beta", { type: "IT", emp: "100-500", city: "Berlin", incYear: 2015 }),
  c("c4", "Delta", { type: "GBS", emp: "50-100", city: "New York", incYear: 2012 }),
  c("c5", "Zeta", { type: "IT", emp: "100-500", city: "Paris", incYear: 2018 }),
  c("c6", "Gamma", { type: "R&D", emp: "1000-5000", city: "Mumbai", incYear: 2011 }),
] as unknown as Center[]

const functions = [fn("c1", "IT"), fn("c1", "HR"), fn("c2", "IT"), fn("c4", "FnA"), fn("c5", "IT")] as unknown as FnRow[]
const tech: Tech[] = []
const prospects = [
  pr("p1", "Acme", { dept: "IT", level: "Director", city: "New York" }),
  pr("p2", "Acme", { dept: "HR", level: "Manager", city: "Austin" }),
  pr("p3", "Beta", { dept: "IT", level: "VP", city: "Berlin" }),
  pr("p4", "Delta", { dept: "Finance", level: "Director", city: "New York" }),
  pr("p5", "Zeta", { dept: "IT", level: "Head", city: "Paris" }),
] as unknown as Prospect[]

function a(name: string, o: Record<string, unknown>) {
  return { account_global_legal_name: name, account_hq_country: o.country, account_primary_category: o.category, account_hq_revenue_range: o.revRange, account_center_employees_range: o.cEmp, account_hq_revenue: 100, years_in_india: 3, account_visibility: o.visibility }
}
function c(cn: string, account: string, o: Record<string, unknown>) {
  return { cn_unique_key: cn, account_global_legal_name: account, center_type: o.type, center_employees_range: o.emp, center_city: o.city, center_inc_year: o.incYear }
}
function fn(cn: string, name: string) { return { cn_unique_key: cn, function_name: name } }
function pr(id: string, account: string, o: Record<string, unknown>) {
  return { ps_unique_key: id, account_global_legal_name: account, prospect_department: o.dept, prospect_level: o.level, prospect_city: o.city }
}

let pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

async function ins(table: string, cols: string[], rows: Record<string, unknown>[]) {
  for (const r of rows) await pool.query(`insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((k) => r[k] ?? null))
}

beforeAll(async () => {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  pool = new Pool()
  await pool.query(`create table accounts (account_global_legal_name text, account_hq_country text, account_primary_category text, account_hq_revenue_range text, account_center_employees_range text, account_hq_revenue bigint, years_in_india int, account_visibility text)`)
  await pool.query(`create table centers (cn_unique_key text, account_global_legal_name text, center_type text, center_employees_range text, center_city text, center_inc_year int)`)
  await pool.query(`create table functions (cn_unique_key text, function_name text)`)
  await pool.query(`create table tech (cn_unique_key text, software_in_use text)`)
  await pool.query(`create table prospects (ps_unique_key text, account_global_legal_name text, prospect_department text, prospect_level text, prospect_city text)`)
  await ins("accounts", ["account_global_legal_name", "account_hq_country", "account_primary_category", "account_hq_revenue_range", "account_center_employees_range", "account_hq_revenue", "years_in_india", "account_visibility"], accounts as unknown as Record<string, unknown>[])
  await ins("centers", ["cn_unique_key", "account_global_legal_name", "center_type", "center_employees_range", "center_city", "center_inc_year"], centers as unknown as Record<string, unknown>[])
  await ins("functions", ["cn_unique_key", "function_name"], functions as unknown as Record<string, unknown>[])
  await ins("prospects", ["ps_unique_key", "account_global_legal_name", "prospect_department", "prospect_level", "prospect_city"], prospects as unknown as Record<string, unknown>[])
})

// Engine-side raw count map for a chart field (name coercion matches calculateChartData).
function countMap<T>(items: T[], field: keyof T): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const it of items) {
    const name = String(it[field] ?? "") || "Unknown"
    m.set(name, (m.get(name) ?? 0) + 1)
  }
  return [...m.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
}

async function sqlCounts(entity: AggregateEntity, filters: Filters, column: string): Promise<Array<[string, number]>> {
  const name = `case when ${column} is null or ${column} = '' then 'Unknown' else ${column} end`
  const q = buildEntityAggregateQuery(entity, filters, {}, `${name} as name, count(*)::int as value`, { groupBy: name, materialized: false })
  const rows = (await pool.query(q.text, q.values)).rows as { name: string; value: number }[]
  return rows.map((r) => [String(r.name), Number(r.value)] as [string, number]).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
}

async function assertChartCounts(overrides: Partial<Filters>) {
  const filters = createDefaultFilters({ accountHqRevenueRange: [0, Number.MAX_SAFE_INTEGER], ...overrides })
  const e = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})
  const checks: Array<[AggregateEntity, string, Array<[string, number]>]> = [
    ["accounts", "account_hq_country", countMap(e.filteredAccounts, "account_hq_country")],
    ["accounts", "account_primary_category", countMap(e.filteredAccounts, "account_primary_category")],
    ["accounts", "account_hq_revenue_range", countMap(e.filteredAccounts, "account_hq_revenue_range")],
    ["accounts", "account_center_employees_range", countMap(e.filteredAccounts, "account_center_employees_range")],
    ["centers", "center_type", countMap(e.filteredCenters, "center_type")],
    ["centers", "center_employees_range", countMap(e.filteredCenters, "center_employees_range")],
    ["centers", "center_city", countMap(e.filteredCenters, "center_city")],
    ["functions", "function_name", countMap(e.filteredFunctions, "function_name")],
    ["prospects", "prospect_department", countMap(e.filteredProspects, "prospect_department")],
    ["prospects", "prospect_level", countMap(e.filteredProspects, "prospect_level")],
    ["prospects", "prospect_city", countMap(e.filteredProspects, "prospect_city")],
  ]
  for (const [entity, column, expected] of checks) {
    expect(await sqlCounts(entity, filters, column), `${entity}.${column}`).toEqual(expected)
  }
}

describe("charts grouped-count parity", () => {
  const inc = (...v: string[]) => v.map((value) => ({ value, mode: "include" as const }))
  const scenarios: Array<[string, Partial<Filters>]> = [
    ["base (gcc)", {}],
    ["visibility all", { accountVisibilityMode: "all" }],
    ["country US", { accountHqCountryValues: inc("United States") }],
    ["prospect dept IT (cascade)", { accountVisibilityMode: "all", prospectDepartmentValues: inc("IT") }],
  ]
  for (const [name, overrides] of scenarios) {
    it(name, async () => { await assertChartCounts(overrides) })
  }
})
