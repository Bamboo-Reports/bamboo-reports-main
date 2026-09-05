import { writeFileSync } from "node:fs"
import { beforeAll, describe, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildAccountsQuery, buildCentersQuery, buildProspectsQuery } from "@/lib/dashboard/filtering-sql"

loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

gated("filtering-sql count report (reproducible on any instance)", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
  let functions: FnRow[]
  let tech: Tech[]
  let prospects: (Prospect & { _rid: string })[]

  beforeAll(async () => {
    sql = neon(DATABASE_URL as string)
    accounts = (await sql.query(`select account_global_legal_name, account_hq_region, account_hq_country, account_hq_industry, account_data_coverage, account_source, account_type, account_primary_category, account_primary_nature, account_nasscom_status, account_hq_employee_range, account_center_employees_range, account_hq_revenue, years_in_india, account_visibility from accounts`)) as unknown as Account[]
    centers = (await sql.query(`select cn_unique_key, account_global_legal_name, center_type, center_focus, center_city, center_state, center_country, center_employees_range, center_status, center_inc_year from centers`)) as unknown as Center[]
    functions = (await sql.query(`select cn_unique_key, function_name from functions`)) as unknown as FnRow[]
    tech = (await sql.query(`select cn_unique_key, software_in_use from tech`)) as unknown as Tech[]
    prospects = (await sql.query(`select ctid::text as _rid, ps_unique_key, account_global_legal_name, prospect_department, head_type, prospect_level, prospect_city, prospect_title from prospects`)) as unknown as (Prospect & { _rid: string })[]
  }, 180_000)

  const inc = (...vs: string[]) => vs.map((value) => ({ value, mode: "include" as const }))
  const exc = (...vs: string[]) => vs.map((value) => ({ value, mode: "exclude" as const }))
  const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

  // Explicit, data-independent scenarios (edit values to match your instance's
  // vocabulary if needed; these use values known to exist in the warehouse).
  const scenarios: Array<[string, Partial<Filters>]> = [
    ["defaults (gcc, wide revenue)", {}],
    ["visibility=all", { accountVisibilityMode: "all" }],
    ["visibility=nonGcc", { accountVisibilityMode: "nonGcc" }],
    ["country=United States", { accountHqCountryValues: inc("United States") }],
    ["industry=Corporate Services", { accountHqIndustryValues: inc("Corporate Services") }],
    ["country=US + centerCity=Bengaluru", { accountHqCountryValues: inc("United States"), centerCityValues: inc("Bengaluru") }],
    ["all + centerStatus=Active Center", { accountVisibilityMode: "all", centerStatusValues: inc("Active Center") }],
    ["all + function=IT", { accountVisibilityMode: "all", functionNameValues: inc("IT") }],
    ["all + prospectDept=IT", { accountVisibilityMode: "all", prospectDepartmentValues: inc("IT") }],
    ["country=US + prospectLevel=Director", { accountHqCountryValues: inc("United States"), prospectLevelValues: inc("Director") }],
    ["all + industry NOT Corporate Services", { accountVisibilityMode: "all", accountHqIndustryValues: exc("Corporate Services") }],
    ["all + prospectTitle~head", { accountVisibilityMode: "all", prospectTitleKeywords: inc("head") }],
  ]

  it("prints per-scenario counts (engine vs sql)", async () => {
    const countSql = async (q: { text: string; values: unknown[] }) => {
      const rows = (await sql.query(q.text, q.values)) as Record<string, unknown>[]
      return rows.length
    }
    const rows: Record<string, string | number>[] = []
    for (const [name, overrides] of scenarios) {
      const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
      const engine = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})
      const a = await countSql(buildAccountsQuery(filters, {}, { orderBy: null }))
      const c = await countSql(buildCentersQuery(filters, {}, { orderBy: null }))
      const p = await countSql(buildProspectsQuery(filters, {}, { orderBy: null, columns: "ctid::text as _rid" }))
      rows.push({
        scenario: name,
        engine_A: engine.filteredAccounts.length,
        sql_A: a,
        engine_C: engine.filteredCenters.length,
        sql_C: c,
        engine_P: engine.filteredProspects.length,
        sql_P: p,
        match: engine.filteredAccounts.length === a && engine.filteredCenters.length === c && engine.filteredProspects.length === p ? "YES" : "NO",
      })
    }
    const out = process.env.REPORT_OUT
    if (out) writeFileSync(out, JSON.stringify(rows, null, 2))
    // eslint-disable-next-line no-console
    console.log("\n=== FILTERING-SQL COUNT REPORT (A=accounts, C=centers, P=prospects) ===")
    // eslint-disable-next-line no-console
    console.table(rows)
  }, 300_000)
})
