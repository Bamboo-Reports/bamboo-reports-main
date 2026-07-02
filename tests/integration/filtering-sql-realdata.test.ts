import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildAccountsQuery, buildCentersQuery, buildProspectsQuery } from "@/lib/dashboard/filtering-sql"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

type Row = Record<string, unknown>

gated("filtering-sql parity against the real Neon warehouse", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
  let functions: FnRow[]
  let tech: Tech[]
  // Prospects carry a physical row id (ctid) so we can compare identity even
  // when ps_unique_key is null or duplicated.
  let prospects: (Prospect & { _rid: string })[]

  const derived: Record<string, string | undefined> = {}

  beforeAll(async () => {
    sql = neon(DATABASE_URL as string)

    accounts = (await sql.query(
      `select account_global_legal_name, account_hq_region, account_hq_country, account_hq_industry,
        account_data_coverage, account_source, account_type, account_primary_category, account_primary_nature,
        account_nasscom_status, account_hq_employee_range, account_center_employees_range,
        account_hq_revenue, years_in_india, account_visibility
       from accounts`
    )) as unknown as Account[]

    centers = (await sql.query(
      `select cn_unique_key, account_global_legal_name, center_type, center_focus, center_city, center_state,
        center_country, center_employees_range, center_status, center_inc_year from centers`
    )) as unknown as Center[]

    functions = (await sql.query(`select cn_unique_key, function_name from functions`)) as unknown as FnRow[]
    tech = (await sql.query(`select cn_unique_key, software_in_use from tech`)) as unknown as Tech[]
    prospects = (await sql.query(
      `select ctid::text as _rid, ps_unique_key, account_global_legal_name, prospect_department, head_type,
        prospect_level, prospect_city, prospect_title from prospects`
    )) as unknown as (Prospect & { _rid: string })[]

    const one = async (q: string): Promise<string | undefined> => {
      const rows = (await sql.query(q)) as Row[]
      const v = rows[0] ? Object.values(rows[0])[0] : undefined
      return v == null ? undefined : String(v)
    }
    derived.country = await one(`select account_hq_country from accounts where account_hq_country is not null group by 1 order by count(*) desc limit 1`)
    derived.industry = await one(`select account_hq_industry from accounts where account_hq_industry is not null group by 1 order by count(*) desc limit 1`)
    derived.city = await one(`select center_city from centers where center_city is not null group by 1 order by count(*) desc limit 1`)
    derived.dept = await one(`select prospect_department from prospects where prospect_department is not null group by 1 order by count(*) desc limit 1`)
    derived.fn = await one(`select function_name from functions where function_name is not null group by 1 order by count(*) desc limit 1`)
    derived.level = await one(`select prospect_level from prospects where prospect_level is not null group by 1 order by count(*) desc limit 1`)
    derived.status = await one(`select center_status from centers where center_status is not null group by 1 order by count(*) desc limit 1`)

    // eslint-disable-next-line no-console
    console.log("real-data sizes:", {
      accounts: accounts.length, centers: centers.length, functions: functions.length,
      tech: tech.length, prospects: prospects.length, derived,
    })
  }, 120_000)

  const inc = (...vs: (string | undefined)[]) =>
    vs.filter((v): v is string => v != null).map((value) => ({ value, mode: "include" as const }))
  const exc = (...vs: (string | undefined)[]) =>
    vs.filter((v): v is string => v != null).map((value) => ({ value, mode: "exclude" as const }))
  const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

  const sortedStr = (xs: unknown[]) => xs.map(String).sort()

  async function runSql(query: { text: string; values: unknown[] }, key: string) {
    const rows = (await sql.query(query.text, query.values)) as Row[]
    return sortedStr(rows.map((r) => r[key]))
  }

  async function parity(overrides: Partial<Filters>) {
    const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
    const engine = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})

    const sqlAccounts = await runSql(buildAccountsQuery(filters, {}, { orderBy: null }), "account_global_legal_name")
    const sqlCenters = await runSql(buildCentersQuery(filters, {}, { orderBy: null }), "cn_unique_key")
    const sqlProspects = await runSql(
      buildProspectsQuery(filters, {}, { orderBy: null, columns: "ctid::text as _rid" }),
      "_rid"
    )

    expect(sqlAccounts).toEqual(sortedStr(engine.filteredAccounts.map((x) => x.account_global_legal_name)))
    expect(sqlCenters).toEqual(sortedStr(engine.filteredCenters.map((x) => x.cn_unique_key)))
    expect(sqlProspects).toEqual(sortedStr(engine.filteredProspects.map((x) => (x as Prospect & { _rid: string })._rid)))

    return { accounts: sqlAccounts.length, centers: sqlCenters.length, prospects: sqlProspects.length }
  }

  it("defaults (gcc, wide revenue)", async () => { await parity({}) }, 120_000)
  it("visibility all", async () => { await parity({ accountVisibilityMode: "all" }) }, 120_000)
  it("visibility nonGcc", async () => { await parity({ accountVisibilityMode: "nonGcc" }) }, 120_000)
  it("country include", async () => { await parity({ accountHqCountryValues: inc(derived.country) }) }, 120_000)
  it("industry include", async () => { await parity({ accountHqIndustryValues: inc(derived.industry) }) }, 120_000)
  it("center city + account country", async () => { await parity({ accountHqCountryValues: inc(derived.country), centerCityValues: inc(derived.city) }) }, 120_000)
  it("center status", async () => { await parity({ accountVisibilityMode: "all", centerStatusValues: inc(derived.status) }) }, 120_000)
  it("function (services offered)", async () => { await parity({ accountVisibilityMode: "all", functionNameValues: inc(derived.fn) }) }, 120_000)
  it("prospect department (cascade up)", async () => { await parity({ accountVisibilityMode: "all", prospectDepartmentValues: inc(derived.dept) }) }, 120_000)
  it("prospect level + country", async () => { await parity({ accountHqCountryValues: inc(derived.country), prospectLevelValues: inc(derived.level) }) }, 120_000)
  it("industry exclude (visibility all)", async () => { await parity({ accountVisibilityMode: "all", accountHqIndustryValues: exc(derived.industry) }) }, 120_000)
  it("prospect title keyword", async () => { await parity({ accountVisibilityMode: "all", prospectTitleKeywords: inc("head") }) }, 120_000)
})
