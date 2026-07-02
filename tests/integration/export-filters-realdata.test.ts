import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildCentersQuery } from "@/lib/dashboard/filtering-sql"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

/**
 * Export-by-filter (#249 Phase 4): the services sheet is built from the
 * surviving centers via an `in (<centers query>)` wrap. Verify the wrapped
 * query returns exactly the services rows of the engine's filtered centers.
 */
gated("export-by-filter services wrap against the real Neon warehouse", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
  let serviceKeys: Array<{ cn_unique_key: string | null }>

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
    serviceKeys = (await sql.query(`select cn_unique_key from services`)) as unknown as Array<{
      cn_unique_key: string | null
    }>
  }, 120_000)

  const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

  async function parity(overrides: Partial<Filters>) {
    const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
    const engine = getFilteredData(accounts, centers, [], [], [], [], filters, {})
    const survivingKeys = new Set(engine.filteredCenters.map((c) => c.cn_unique_key))
    const expected = serviceKeys.filter((s) => s.cn_unique_key !== null && survivingKeys.has(s.cn_unique_key)).length

    const centersSub = buildCentersQuery(filters, {}, { columns: "cn_unique_key", orderBy: null })
    const rows = (await sql.query(
      `select count(*)::int as total from services where cn_unique_key in (${centersSub.text})`,
      centersSub.values
    )) as unknown as Array<{ total: number }>

    expect(Number(rows[0]?.total)).toBe(expected)
    return expected
  }

  it("defaults (gcc)", async () => { await parity({}) }, 120_000)
  it("visibility all", async () => { await parity({ accountVisibilityMode: "all" }) }, 120_000)
  it("center city include", async () => {
    await parity({ accountVisibilityMode: "all", centerCityValues: [{ value: "Bengaluru", mode: "include" }] })
  }, 120_000)
})
