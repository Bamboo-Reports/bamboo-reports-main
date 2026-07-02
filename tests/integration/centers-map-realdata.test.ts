import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Account, Center, Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { getFilteredData } from "@/lib/dashboard/filtering"
import { buildCityMapQuery, buildStateMapQuery, type CityMapRow, type StateMapRow } from "@/lib/dashboard/centers-map"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

type Row = Record<string, unknown>

// Client city aggregation, mirroring components/maps/centers-map.tsx cityData.
function clientCityData(centers: Center[]) {
  const cityMap = new Map<string, { country: string; lat: number; lng: number; count: number; accounts: Set<string>; headcount: number }>()
  for (const c of centers) {
    const { center_city: city, lat, lng } = c
    if (lat === null || lat === undefined || lng === null || lng === undefined || isNaN(lat) || isNaN(lng)) continue
    if (!city) continue
    const existing = cityMap.get(city)
    if (existing) {
      existing.count += 1
      existing.accounts.add(c.account_global_legal_name)
      existing.headcount += c.center_employees ?? 0
    } else {
      cityMap.set(city, {
        country: c.center_country ?? "",
        lat,
        lng,
        count: 1,
        accounts: new Set([c.account_global_legal_name]),
        headcount: c.center_employees ?? 0,
      })
    }
  }
  return cityMap
}

// Client state aggregation, mirroring buildStateAggregates in centers-choropleth-map.tsx.
function clientStateData(centers: Center[]) {
  const byState = new Map<string, { count: number; accounts: Set<string>; headcount: number }>()
  for (const c of centers) {
    const state = (c.center_state || "").trim().toLowerCase()
    const iso2 = (c.center_country_iso2 || "").trim().toUpperCase()
    if (!state || !iso2) continue
    const key = `${iso2}|${state}`
    const entry = byState.get(key) ?? { count: 0, accounts: new Set<string>(), headcount: 0 }
    entry.count += 1
    if (c.account_global_legal_name) entry.accounts.add(c.account_global_legal_name)
    entry.headcount += c.center_employees ?? 0
    byState.set(key, entry)
  }
  return byState
}

gated("centers map aggregation parity against the real Neon warehouse", () => {
  let sql: ReturnType<typeof neon>
  let accounts: Account[]
  let centers: Center[]
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

    // center_name asc matches the order the app receives centers in
    // (app/actions/data.ts), which the client "first center wins" rules use.
    centers = (await sql.query(
      `select cn_unique_key, account_global_legal_name, center_name, center_type, center_focus, center_city,
        center_state, center_country, center_country_iso2, center_employees_range, center_status,
        center_inc_year, center_employees, lat, lng
       from centers order by center_name asc`
    )) as unknown as Center[]

    const one = async (q: string): Promise<string | undefined> => {
      const rows = (await sql.query(q)) as Row[]
      const v = rows[0] ? Object.values(rows[0])[0] : undefined
      return v == null ? undefined : String(v)
    }
    derived.country = await one(`select account_hq_country from accounts where account_hq_country is not null group by 1 order by count(*) desc limit 1`)
    derived.status = await one(`select center_status from centers where center_status is not null group by 1 order by count(*) desc limit 1`)
  }, 120_000)

  const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER]

  async function parity(overrides: Partial<Filters>) {
    const filters = createDefaultFilters({ accountHqRevenueRange: WIDE, ...overrides })
    const engine = getFilteredData(accounts, centers, [], [], [], [], filters, {})

    const cityRows = (await sql.query(
      buildCityMapQuery(filters).text,
      buildCityMapQuery(filters).values
    )) as unknown as CityMapRow[]
    const stateRows = (await sql.query(
      buildStateMapQuery(filters).text,
      buildStateMapQuery(filters).values
    )) as unknown as StateMapRow[]

    const expectedCities = clientCityData(engine.filteredCenters)
    expect(cityRows).toHaveLength(expectedCities.size)
    for (const row of cityRows) {
      const expected = expectedCities.get(row.city)
      expect(expected, `city ${row.city}`).toBeDefined()
      expect(Number(row.count), `count for ${row.city}`).toBe(expected!.count)
      expect(Number(row.accounts_count), `accounts for ${row.city}`).toBe(expected!.accounts.size)
      expect(Number(row.headcount), `headcount for ${row.city}`).toBe(expected!.headcount)
      expect(row.country, `country for ${row.city}`).toBe(expected!.country)
      expect(Number(row.lat)).toBeCloseTo(expected!.lat, 6)
      expect(Number(row.lng)).toBeCloseTo(expected!.lng, 6)
    }

    const expectedStates = clientStateData(engine.filteredCenters)
    expect(stateRows).toHaveLength(expectedStates.size)
    for (const row of stateRows) {
      const key = `${row.country_iso2}|${row.state_key}`
      const expected = expectedStates.get(key)
      expect(expected, `state ${key}`).toBeDefined()
      expect(Number(row.count), `count for ${key}`).toBe(expected!.count)
      expect(Number(row.accounts_count), `accounts for ${key}`).toBe(expected!.accounts.size)
      expect(Number(row.headcount), `headcount for ${key}`).toBe(expected!.headcount)
    }

    return { cities: cityRows.length, states: stateRows.length }
  }

  it("defaults (gcc, wide revenue)", async () => {
    const r = await parity({})
    // eslint-disable-next-line no-console
    console.log("map parity defaults:", r)
  }, 120_000)

  it("visibility all", async () => { await parity({ accountVisibilityMode: "all" }) }, 120_000)

  it("account country include", async () => {
    await parity({ accountHqCountryValues: derived.country ? [{ value: derived.country, mode: "include" }] : [] })
  }, 120_000)

  it("center status include", async () => {
    await parity({
      accountVisibilityMode: "all",
      centerStatusValues: derived.status ? [{ value: derived.status, mode: "include" }] : [],
    })
  }, 120_000)
})
