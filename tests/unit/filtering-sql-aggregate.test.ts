import { beforeAll, describe, expect, it } from "vitest"
import { newDb } from "pg-mem"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { countsTowardHeadcount } from "@/lib/dashboard/headcount"
import { buildEntityAggregateQuery } from "@/lib/dashboard/filtering-sql"

// Same SQL the summary route uses for center count/upcoming/headcount.
const CENTER_METRICS =
  "count(*)::int as centers, " +
  "sum(case when center_status = 'Upcoming' then 1 else 0 end)::int as upcoming, " +
  "coalesce(sum(case when (center_type is null or lower(center_type) not in " +
  "('manufacturing', 'sales & marketing', 'bpo', 'distribution')) then center_employees else 0 end), 0)::int as headcount"

const accounts = [
  a("Acme", { country: "United States", visibility: "include" }),
  a("Beta", { country: "Germany", visibility: "include" }),
  a("Gamma", { country: "India", visibility: "exclude" }),
  a("Delta", { country: "United States", visibility: "include" }),
] as unknown as Account[]

// center_employees + a mix of headcount-excluded types (Manufacturing / Sales & Marketing).
const centers = [
  c("c1", "Acme", { type: "IT", status: "Active", emp: 500 }),
  c("c2", "Acme", { type: "Manufacturing", status: "Active", emp: 900 }),
  c("c3", "Beta", { type: "R&D", status: "Upcoming", emp: 100 }),
  c("c4", "Delta", { type: "Sales & Marketing", status: "Active", emp: 300 }),
  c("c5", "Delta", { type: "GBS", status: "Upcoming", emp: 250 }),
  c("c6", "Gamma", { type: "IT", status: "Active", emp: 700 }),
] as unknown as Center[]

const functions: FnRow[] = []
const tech: Tech[] = []
const prospects = [
  pr("p1", "Acme", { dept: "IT" }),
  pr("p2", "Acme", { dept: "HR" }),
  pr("p3", "Beta", { dept: "IT" }),
  pr("p4", "Delta", { dept: "Finance" }),
  pr("p5", "Gamma", { dept: "IT" }),
] as unknown as Prospect[]

function a(name: string, o: Record<string, unknown>) {
  return { account_global_legal_name: name, account_hq_country: o.country, account_visibility: o.visibility, account_hq_revenue: o.revenue ?? null, years_in_india: o.years ?? null }
}
function c(cn: string, account: string, o: Record<string, unknown>) {
  return { cn_unique_key: cn, account_global_legal_name: account, center_type: o.type, center_status: o.status, center_employees: o.emp, center_inc_year: o.incYear ?? null }
}
function pr(id: string, account: string, o: Record<string, unknown>) {
  return { ps_unique_key: id, account_global_legal_name: account, prospect_department: o.dept }
}

let pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

beforeAll(async () => {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  pool = new Pool()
  await pool.query(`create table accounts (account_global_legal_name text, account_hq_country text, account_visibility text, account_hq_revenue bigint, years_in_india int)`)
  await pool.query(`create table centers (cn_unique_key text, account_global_legal_name text, center_type text, center_status text, center_employees int, center_inc_year int)`)
  await pool.query(`create table functions (cn_unique_key text, function_name text)`)
  await pool.query(`create table tech (cn_unique_key text, software_in_use text)`)
  await pool.query(`create table prospects (ps_unique_key text, account_global_legal_name text, prospect_department text)`)
  for (const r of accounts as unknown as Record<string, unknown>[]) await pool.query(`insert into accounts values ($1,$2,$3,$4,$5)`, [r.account_global_legal_name, r.account_hq_country, r.account_visibility, r.account_hq_revenue, r.years_in_india])
  for (const r of centers as unknown as Record<string, unknown>[]) await pool.query(`insert into centers values ($1,$2,$3,$4,$5,$6)`, [r.cn_unique_key, r.account_global_legal_name, r.center_type, r.center_status, r.center_employees, r.center_inc_year])
  for (const r of prospects as unknown as Record<string, unknown>[]) await pool.query(`insert into prospects values ($1,$2,$3)`, [r.ps_unique_key, r.account_global_legal_name, r.prospect_department])
})

const inc = (...vs: string[]) => vs.map((value) => ({ value, mode: "include" as const }))
const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

async function q(query: { text: string; values: unknown[] }) {
  return (await pool.query(query.text, query.values)).rows
}

async function assertMetrics(name: string, overrides: Partial<Filters>) {
  const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
  const e = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})
  const engine = {
    accounts: e.filteredAccounts.length,
    centers: e.filteredCenters.length,
    upcoming: e.filteredCenters.filter((x) => x.center_status === "Upcoming").length,
    headcount: e.filteredCenters.reduce((s, x) => s + (countsTowardHeadcount(x.center_type) ? (x.center_employees ?? 0) : 0), 0),
    prospects: e.filteredProspects.length,
  }
  const o = { materialized: false } as const
  const accF = await q(buildEntityAggregateQuery("accounts", filters, {}, "count(*)::int as total", o))
  const cenF = await q(buildEntityAggregateQuery("centers", filters, {}, CENTER_METRICS, o))
  const proF = await q(buildEntityAggregateQuery("prospects", filters, {}, "count(*)::int as total", o))
  const sqlMetrics = {
    accounts: Number(accF[0]?.total ?? 0),
    centers: Number(cenF[0]?.centers ?? 0),
    upcoming: Number(cenF[0]?.upcoming ?? 0),
    headcount: Number(cenF[0]?.headcount ?? 0),
    prospects: Number(proF[0]?.total ?? 0),
  }
  expect(sqlMetrics, name).toEqual(engine)
}

describe("summary aggregate parity (buildEntityAggregateQuery vs engine)", () => {
  const scenarios: Array<[string, Partial<Filters>]> = [
    ["defaults (gcc)", {}],
    ["visibility all", { accountVisibilityMode: "all" }],
    ["visibility nonGcc", { accountVisibilityMode: "nonGcc" }],
    ["country=US", { accountHqCountryValues: inc("United States") }],
    ["prospect dept=IT (cascade)", { accountVisibilityMode: "all", prospectDepartmentValues: inc("IT") }],
  ]
  for (const [name, overrides] of scenarios) {
    it(name, async () => {
      await assertMetrics(name, overrides)
    })
  }
})
