import { writeFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters, FilterValue } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildAccountsQuery, buildCentersQuery, buildProspectsQuery } from "@/lib/dashboard/filtering-sql"

loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip
const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

type Row = Record<string, unknown>
type ValueCount = { value: string; count: number }

function lcg(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000)
}

gated("filtering-sql thorough cross-attribute report", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
  let functions: FnRow[]
  let tech: Tech[]
  let prospects: (Prospect & { _rid: string })[]
  const pools: Record<string, ValueCount[]> = {}

  const topValues = async (table: string, col: string, k = 6): Promise<ValueCount[]> => {
    const rows = (await sql.query(
      `select ${col} as v, count(*)::int as c from ${table} where ${col} is not null and ${col} <> '' group by 1 order by c desc limit ${k}`
    )) as Row[]
    return rows.map((r) => ({ value: String(r.v), count: Number(r.c) }))
  }

  beforeAll(async () => {
    sql = neon(DATABASE_URL as string)
    accounts = (await sql.query(`select account_global_legal_name, account_hq_region, account_hq_country, account_hq_industry, account_data_coverage, account_source, account_type, account_primary_category, account_primary_nature, account_nasscom_status, account_hq_employee_range, account_center_employees_range, account_hq_revenue, years_in_india, account_visibility from accounts`)) as unknown as Account[]
    centers = (await sql.query(`select cn_unique_key, account_global_legal_name, center_type, center_focus, center_city, center_state, center_country, center_employees_range, center_status, center_inc_year from centers`)) as unknown as Center[]
    functions = (await sql.query(`select cn_unique_key, function_name from functions`)) as unknown as FnRow[]
    tech = (await sql.query(`select cn_unique_key, software_in_use from tech`)) as unknown as Tech[]
    prospects = (await sql.query(`select ctid::text as _rid, ps_unique_key, account_global_legal_name, prospect_department, head_type, prospect_level, prospect_city, prospect_title from prospects`)) as unknown as (Prospect & { _rid: string })[]

    const derive: Array<[string, string, string]> = [
      ["region", "accounts", "account_hq_region"], ["country", "accounts", "account_hq_country"],
      ["industry", "accounts", "account_hq_industry"], ["primaryCategory", "accounts", "account_primary_category"],
      ["primaryNature", "accounts", "account_primary_nature"], ["nasscom", "accounts", "account_nasscom_status"],
      ["empRange", "accounts", "account_hq_employee_range"], ["type", "accounts", "account_type"],
      ["centerType", "centers", "center_type"], ["centerFocus", "centers", "center_focus"],
      ["centerCity", "centers", "center_city"], ["centerState", "centers", "center_state"],
      ["centerStatus", "centers", "center_status"], ["centerEmpRange", "centers", "center_employees_range"],
      ["fn", "functions", "function_name"], ["software", "tech", "software_in_use"],
      ["dept", "prospects", "prospect_department"], ["head", "prospects", "head_type"],
      ["level", "prospects", "prospect_level"], ["prospectCity", "prospects", "prospect_city"],
      ["title", "prospects", "prospect_title"],
    ]
    for (const [key, table, col] of derive) pools[key] = await topValues(table, col, 6)
  }, 240_000)

  it("runs a wide combined-filter matrix and reports counts", async () => {
    const rand = lcg(0x5eed42)
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
    const vals = (pool: ValueCount[], mode: "include" | "exclude"): FilterValue[] => {
      if (pool.length === 0) return []
      const n = 1 + Math.floor(rand() * Math.min(2, pool.length))
      const set = new Set<string>()
      for (let i = 0; i < n; i++) set.add(pick(pool).value)
      return [...set].map((value) => ({ value, mode }))
    }
    const mode = () => (rand() < 0.78 ? ("include" as const) : ("exclude" as const))

    const accountAttrs: Array<keyof Filters> = ["accountHqCountryValues", "accountHqIndustryValues", "accountHqRegionValues", "accountPrimaryCategoryValues", "accountNasscomStatusValues", "accountHqEmployeeRangeValues", "accountTypeValues"]
    const accountPool: Record<string, string> = { accountHqCountryValues: "country", accountHqIndustryValues: "industry", accountHqRegionValues: "region", accountPrimaryCategoryValues: "primaryCategory", accountNasscomStatusValues: "nasscom", accountHqEmployeeRangeValues: "empRange", accountTypeValues: "type" }
    const centerAttrs: Array<keyof Filters> = ["centerTypeValues", "centerFocusValues", "centerCityValues", "centerStateValues", "centerStatusValues", "centerEmployeesRangeValues"]
    const centerPool: Record<string, string> = { centerTypeValues: "centerType", centerFocusValues: "centerFocus", centerCityValues: "centerCity", centerStateValues: "centerState", centerStatusValues: "centerStatus", centerEmployeesRangeValues: "centerEmpRange" }
    const prospectAttrs: Array<keyof Filters> = ["prospectDepartmentValues", "prospectHeadTypeValues", "prospectLevelValues", "prospectCityValues"]
    const prospectPool: Record<string, string> = { prospectDepartmentValues: "dept", prospectHeadTypeValues: "head", prospectLevelValues: "level", prospectCityValues: "prospectCity" }

    const N = 60
    const results: Row[] = []
    const label = (o: Partial<Filters>) =>
      Object.entries(o)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k, v]) => `${k.replace(/Values$|Keywords$/, "")}${(v as FilterValue[])[0].mode === "exclude" ? "∌" : "⊇"}[${(v as FilterValue[]).map((x) => x.value).join(",")}]`)
        .join(" & ")

    for (let i = 0; i < N; i++) {
      const o: Partial<Filters> = { accountHqRevenueRange: WIDE }
      o.accountVisibilityMode = pick(["all", "all", "gcc", "nonGcc"]) as Filters["accountVisibilityMode"]
      // one account + one center + one prospect attribute, always all three
      const aKey = pick(accountAttrs)
      ;(o as Record<string, FilterValue[]>)[aKey as string] = vals(pools[accountPool[aKey as string]], mode())
      const cKey = pick(centerAttrs)
      ;(o as Record<string, FilterValue[]>)[cKey as string] = vals(pools[centerPool[cKey as string]], mode())
      if (rand() < 0.5) {
        const pKey = pick(prospectAttrs)
        ;(o as Record<string, FilterValue[]>)[pKey as string] = vals(pools[prospectPool[pKey as string]], mode())
      } else {
        o.prospectTitleKeywords = pools.title.length ? [{ value: pick(pools.title).value.split(/\s+/)[0].toLowerCase(), mode: "include" }] : []
      }
      if (rand() < 0.25 && pools.fn.length) o.functionNameValues = vals(pools.fn, "include")
      if (rand() < 0.2 && pools.software.length) o.techSoftwareInUseKeywords = [{ value: pick(pools.software).value.split(/\s+/)[0].toLowerCase(), mode: "include" }]

      const filters = createDefaultFilters(o)
      const engine = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})
      const countSql = async (q: { text: string; values: unknown[] }) => ((await sql.query(q.text, q.values)) as Row[]).length
      const a = await countSql(buildAccountsQuery(filters, {}, { orderBy: null }))
      const c = await countSql(buildCentersQuery(filters, {}, { orderBy: null }))
      const p = await countSql(buildProspectsQuery(filters, {}, { orderBy: null, columns: "ctid::text as _rid" }))
      const eA = engine.filteredAccounts.length, eC = engine.filteredCenters.length, eP = engine.filteredProspects.length
      results.push({ i, vis: o.accountVisibilityMode as string, filters: label(o), eA, a, eC, c, eP, p, match: eA === a && eC === c && eP === p })
    }

    const mismatches = results.filter((r) => r.match === false)
    const out = process.env.REPORT_OUT
    if (out) {
      writeFileSync(out, JSON.stringify({
        datasetSizes: { accounts: accounts.length, centers: centers.length, functions: functions.length, tech: tech.length, prospects: prospects.length },
        dataFacts: pools,
        summary: { total: results.length, matched: results.length - mismatches.length, mismatched: mismatches.length },
        mismatches,
        scenarios: results,
      }, null, 2))
    }
    expect(mismatches, `${mismatches.length} scenarios diverged (see REPORT_OUT)`).toEqual([])
  }, 1_200_000)
})
