import { beforeAll, describe, expect, it } from "vitest"
import { neon } from "@neondatabase/serverless"
import { config as loadEnv } from "dotenv"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { resolveOrder } from "@/lib/dashboard/entity-query"
import { buildAccountsQuery, buildCentersQuery } from "@/lib/dashboard/filtering-sql"

// Loads DATABASE_URL from .env (vitest does not do this automatically).
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
const gated = DATABASE_URL ? describe : describe.skip

const UNITS: Record<string, number> = { K: 1e3, Mn: 1e6, Bn: 1e9 }

// Independent reading of a bucket label's lower bound: "<10Mn" sorts first,
// "10Mn - 50Mn" starts at 10e6, ">50Bn" at 50e9, "5K - 10K" at 5e3.
function lowerBound(label: string): number {
  if (label.startsWith("<")) return -1
  const m = /([0-9.]+)\s*([A-Za-z]*)/.exec(label)
  if (!m) throw new Error(`unparseable range label: ${label}`)
  return Number(m[1]) * (UNITS[m[2]] ?? 1)
}

// Collapses the ordered column to its sequence of distinct buckets, so any
// bucket that shows up twice means the buckets were interleaved.
function bucketSequence(values: (string | null)[]): (string | null)[] {
  return values.filter((v, i) => i === 0 || v !== values[i - 1])
}

gated("range columns sort by bucket size against the real Neon warehouse", () => {
  let sql: ReturnType<typeof neon>

  beforeAll(() => {
    sql = neon(DATABASE_URL as string)
  })

  const cases = [
    { entity: "accounts" as const, column: "account_hq_revenue_range", build: buildAccountsQuery },
    { entity: "accounts" as const, column: "account_center_employees_range", build: buildAccountsQuery },
    { entity: "accounts" as const, column: "account_hq_employee_range", build: buildAccountsQuery },
    { entity: "centers" as const, column: "center_employees_range", build: buildCentersQuery },
  ]

  for (const { entity, column, build } of cases) {
    for (const direction of ["asc", "desc"] as const) {
      it(`${entity}.${column} ${direction}`, async () => {
        const q = build(createDefaultFilters(), {}, {
          columns: column,
          orderBy: resolveOrder(entity, { column, direction }),
          limit: 100000,
          offset: 0,
        })
        const rows = (await sql.query(q.text, q.values)) as Record<string, string | null>[]
        const seq = bucketSequence(rows.map((r) => r[column]))

        const labels = seq.filter((v): v is string => v !== null)
        const expected = [...labels].sort((a, b) => lowerBound(a) - lowerBound(b))
        if (direction === "desc") expected.reverse()

        expect(labels.length).toBeGreaterThan(1)
        expect(labels).toEqual(expected)
        // Each bucket appears once (no interleaving), and nulls come last.
        expect(new Set(seq).size).toBe(seq.length)
        if (seq.includes(null)) expect(seq.at(-1)).toBeNull()
      })
    }
  }
})
