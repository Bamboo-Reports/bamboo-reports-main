import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import type { Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { buildAccountsQuery } from "@/lib/dashboard/filtering-sql"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
// Opt-in only (RUN_REALDATA_TESTS=1): these pull large parts of the live
// warehouse and would otherwise run on every local `npm test`.
const gated = DATABASE_URL && process.env.RUN_REALDATA_TESTS === "1" ? describe : describe.skip

const inc = (...vs: string[]) => vs.map((value) => ({ value, mode: "include" as const }))
const exc = (...vs: string[]) => vs.map((value) => ({ value, mode: "exclude" as const }))

// Account Name picks match whole names (#308). "Microsoft Corp." is also a
// substring of "Nuance Communications Inc. (Acquired by Microsoft Corp.)".
gated("account name picks against the real Neon warehouse (#308)", () => {
  let sql: ReturnType<typeof neon>

  beforeAll(() => {
    sql = neon(DATABASE_URL as string)
  })

  async function names(overrides: Partial<Filters>): Promise<string[]> {
    const q = buildAccountsQuery(createDefaultFilters(overrides), {}, { columns: "account_global_legal_name", orderBy: null })
    const rows = (await sql.query(q.text, q.values)) as { account_global_legal_name: string }[]
    return rows.map((r) => r.account_global_legal_name).sort()
  }

  it("including a pick returns only that account", async () => {
    expect(await names({ accountGlobalLegalNameKeywords: inc("Microsoft Corp.") })).toEqual(["Microsoft Corp."])
  })

  it("excluding a pick keeps accounts that only mention it", async () => {
    const all = await names({ accountVisibilityMode: "all" })
    const nuance = all.find((n) => n.includes("(Acquired by Microsoft Corp.)"))
    expect(nuance).toBeDefined()
    const kept = await names({ accountVisibilityMode: "all", accountGlobalLegalNameKeywords: exc("Microsoft Corp.") })
    expect(kept).not.toContain("Microsoft Corp.")
    expect(kept).toContain(nuance)
    expect(kept).toHaveLength(all.length - 1)
  }, 20_000)

  it("a pick saved with a line break still matches", async () => {
    expect(await names({ accountGlobalLegalNameKeywords: inc("Skava\n(Acquired by Infosys Ltd.)") })).toEqual([
      "Skava (Acquired by Infosys Ltd.)",
    ])
  })
})
