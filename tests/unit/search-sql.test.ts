import { beforeAll, describe, expect, it } from "vitest"
import { newDb } from "pg-mem"
import type { Account, Alias, Center, Prospect } from "@/lib/types"
import { buildSearchIndex, searchIndex } from "@/lib/search/index"
import { buildAccountSearch, buildCenterSearch, buildProspectSearch, firstAliasMatch, type SearchQueries } from "@/lib/search/search-sql"

const accounts = [
  { account_global_legal_name: "Acme Corp", account_hq_industry: "Software", account_hq_country: "United States" },
  { account_global_legal_name: "Beta Auto AG", account_hq_industry: "Automotive", account_hq_country: "Germany" },
  { account_global_legal_name: "Globex", account_hq_industry: "Software", account_hq_country: "India" },
  { account_global_legal_name: "Initech", account_hq_industry: "Finance", account_hq_country: "United States" },
] as unknown as Account[]

const aliases = [
  { account_global_legal_name: "Globex", abbreviated_name: "GBX", brand_name: "Widgets Inc", short_legal_name: "Globex Ltd", currently_known_as: null, flagship_products: "SuperWidget" },
] as unknown as Alias[]

const centers = [
  { cn_unique_key: "c1", center_name: "Acme NYC", account_global_legal_name: "Acme Corp", center_city: "New York", center_state: "NY", center_country: "United States" },
  { cn_unique_key: "c2", center_name: null, account_global_legal_name: "Beta Auto AG", center_city: "Berlin", center_state: "BE", center_country: "Germany" },
  { cn_unique_key: "c3", center_name: "Globex Pune", account_global_legal_name: "Globex", center_city: "Pune", center_state: "MH", center_country: "India" },
] as unknown as Center[]

const prospects = [
  { ps_unique_key: "p1", prospect_full_name: "Jane Smith", prospect_first_name: null, prospect_last_name: null, prospect_title: "VP Engineering", head_type: "IT Head", account_global_legal_name: "Acme Corp", center_name: "Acme NYC", prospect_email: "jane@acme.com" },
  { ps_unique_key: "p2", prospect_full_name: null, prospect_first_name: "John", prospect_last_name: "Doe", prospect_title: "CFO", head_type: null, account_global_legal_name: "Beta Auto AG", center_name: null, prospect_email: "john.doe@beta.com" },
  { ps_unique_key: "p3", prospect_full_name: "Alice Wong", prospect_first_name: null, prospect_last_name: null, prospect_title: "Head of HR", head_type: null, account_global_legal_name: "Globex", center_name: null, prospect_email: "alice@globex.com" },
] as unknown as Prospect[]

let pool: { query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

async function ins(table: string, cols: string[], rows: Record<string, unknown>[]) {
  for (const r of rows) await pool.query(`insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => r[c] ?? null))
}

beforeAll(async () => {
  const db = newDb()
  const { Pool } = db.adapters.createPg()
  pool = new Pool()
  await pool.query(`create table accounts (account_global_legal_name text, account_hq_industry text, account_hq_country text)`)
  await pool.query(`create table alias (account_global_legal_name text, abbreviated_name text, brand_name text, short_legal_name text, currently_known_as text, flagship_products text)`)
  await pool.query(`create table centers (cn_unique_key text, center_name text, account_global_legal_name text, center_city text, center_state text, center_country text)`)
  await pool.query(`create table prospects (ps_unique_key text, prospect_full_name text, prospect_first_name text, prospect_last_name text, prospect_title text, head_type text, account_global_legal_name text, center_name text, prospect_email text)`)
  await ins("accounts", ["account_global_legal_name", "account_hq_industry", "account_hq_country"], accounts as unknown as Record<string, unknown>[])
  await ins("alias", ["account_global_legal_name", "abbreviated_name", "brand_name", "short_legal_name", "currently_known_as", "flagship_products"], aliases as unknown as Record<string, unknown>[])
  await ins("centers", ["cn_unique_key", "center_name", "account_global_legal_name", "center_city", "center_state", "center_country"], centers as unknown as Record<string, unknown>[])
  await ins("prospects", ["ps_unique_key", "prospect_full_name", "prospect_first_name", "prospect_last_name", "prospect_title", "head_type", "account_global_legal_name", "center_name", "prospect_email"], prospects as unknown as Record<string, unknown>[])
})

const index = () => buildSearchIndex(accounts, centers, prospects, aliases)

async function sqlGroup(q: SearchQueries): Promise<{ ids: string[]; total: number }> {
  const items = (await pool.query(q.items.text, q.items.values)).rows as { id: string }[]
  const count = (await pool.query(q.count.text, q.count.values)).rows as { total: number }[]
  return { ids: items.map((r) => String(r.id)).sort(), total: Number(count[0]?.total ?? 0) }
}

async function assertTerm(term: string) {
  const engine = searchIndex(index(), term)
  const acc = await sqlGroup(buildAccountSearch(term))
  const cen = await sqlGroup(buildCenterSearch(term))
  const pro = await sqlGroup(buildProspectSearch(term))
  // Fixtures are small (< 10 per group), so items == full match set.
  expect(acc.total, `${term} account total`).toBe(engine.accounts.totalMatches)
  expect(acc.ids, `${term} accounts`).toEqual(engine.accounts.items.map((r) => r.id).sort())
  expect(cen.total, `${term} center total`).toBe(engine.centers.totalMatches)
  expect(cen.ids, `${term} centers`).toEqual(engine.centers.items.map((r) => r.id).sort())
  expect(pro.total, `${term} prospect total`).toBe(engine.prospects.totalMatches)
  expect(pro.ids, `${term} prospects`).toEqual(engine.prospects.items.map((r) => r.id).sort())
}

describe("search-sql parity with searchIndex (match set + totals)", () => {
  for (const term of ["acme", "widget", "german", "york", "globex", "gbx", "doe", "software"]) {
    it(`term "${term}"`, async () => {
      await assertTerm(term)
    })
  }
})

describe("firstAliasMatch", () => {
  it("returns the first field (in order) whose value contains the term", () => {
    const rows = [{ abbreviated_name: "GBX", brand_name: "Widgets Inc", short_legal_name: "Globex Ltd", currently_known_as: null, flagship_products: "SuperWidget" }]
    expect(firstAliasMatch(rows, "widget")).toEqual({ field: "brand_name", value: "Widgets Inc" })
    expect(firstAliasMatch(rows, "gbx")).toEqual({ field: "abbreviated_name", value: "GBX" })
    expect(firstAliasMatch(rows, "nomatch")).toBeNull()
    expect(firstAliasMatch(undefined, "x")).toBeNull()
  })
})
