import ExcelJS from "exceljs"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Function as FnRow, Prospect, Tech, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"

// The warehouse client is guarded by the "server-only" package, which throws
// outside a server bundle; neutralize it for this node-side integration test.
vi.mock("server-only", () => ({}))

import { buildServerExport } from "@/lib/exports/server-builder"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

/**
 * Full export-by-filter validation (#249 Phase 4): build the actual xlsx
 * through buildServerExport({ filters }) against the live warehouse and check
 * every sheet's row count against the reference client engine.
 */
gated("export-by-filter workbook parity against the real Neon warehouse", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
  let functions: FnRow[]
  let tech: Tech[]
  let prospects: Prospect[]
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
    functions = (await sql.query(`select cn_unique_key, function_name from functions`)) as unknown as FnRow[]
    tech = (await sql.query(`select cn_unique_key, software_in_use from tech`)) as unknown as Tech[]
    prospects = (await sql.query(
      `select ps_unique_key, account_global_legal_name, prospect_department, head_type,
        prospect_level, prospect_city, prospect_title from prospects`
    )) as unknown as Prospect[]
    serviceKeys = (await sql.query(`select cn_unique_key from services`)) as unknown as Array<{
      cn_unique_key: string | null
    }>
  }, 120_000)

  const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]
  const inc = (...vs: string[]) => vs.map((value) => ({ value, mode: "include" as const }))
  const exc = (...vs: string[]) => vs.map((value) => ({ value, mode: "exclude" as const }))

  async function validate(label: string, overrides: Partial<Filters>) {
    const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
    const engine = getFilteredData(accounts, centers, functions, [], prospects, tech, filters, {})
    const survivingKeys = new Set(engine.filteredCenters.map((c) => c.cn_unique_key))
    const expected = {
      accounts: engine.filteredAccounts.length,
      centers: engine.filteredCenters.length,
      services: serviceKeys.filter((s) => s.cn_unique_key !== null && survivingKeys.has(s.cn_unique_key)).length,
      prospects: engine.filteredProspects.length,
    }

    const result = await buildServerExport({
      datasets: ["accounts", "centers", "services", "prospects"],
      filters,
      access: {},
    })

    expect(result.rowCounts, `rowCounts for ${label}`).toEqual(expected)

    // Trust nothing: open the workbook and count actual sheet rows.
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheetRows = (name: string) => {
      const sheet = workbook.getWorksheet(name)
      if (!sheet) return 0
      return Math.max(0, sheet.actualRowCount - (sheet.actualRowCount > 0 ? 1 : 0))
    }
    expect(sheetRows("Accounts"), `Accounts sheet for ${label}`).toBe(expected.accounts)
    expect(sheetRows("Centers"), `Centers sheet for ${label}`).toBe(expected.centers)
    expect(sheetRows("Services"), `Services sheet for ${label}`).toBe(expected.services)
    expect(sheetRows("Prospects"), `Prospects sheet for ${label}`).toBe(expected.prospects)

    // eslint-disable-next-line no-console
    console.log(`workbook parity [${label}]:`, expected)
    return expected
  }

  it("defaults (gcc, wide revenue)", async () => {
    await validate("defaults gcc", {})
  }, 240_000)

  it("visibility all + center city Bengaluru", async () => {
    await validate("all + Bengaluru", {
      accountVisibilityMode: "all",
      centerCityValues: inc("Bengaluru"),
    })
  }, 240_000)

  it("country US + prospect dept IT + center type exclude Manufacturing", async () => {
    await validate("US + dept IT - Manufacturing", {
      accountVisibilityMode: "all",
      accountHqCountryValues: inc("United States"),
      prospectDepartmentValues: inc("IT"),
      centerTypeValues: exc("Manufacturing"),
    })
  }, 240_000)

  it("cross-attribute: industry + function + prospect level (gcc)", async () => {
    await validate("industry + function + level", {
      accountHqIndustryValues: inc("Corporate Services", "Financial Services"),
      functionNameValues: inc("IT"),
      prospectLevelValues: inc("Director", "VP"),
    })
  }, 240_000)
})
