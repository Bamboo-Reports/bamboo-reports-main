import "server-only"

import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import type { SqlQuery } from "@/lib/dashboard/filtering-sql"

let cached: NeonQueryFunction<false, false> | null = null

function client(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not configured")
  if (!cached) cached = neon(url)
  return cached
}

/**
 * Postgres-side cap for one warehouse query. The routes run for at most 60s
 * on Vercel (maxDuration), and a killed function does not cancel its query,
 * so the database stops the query itself before that, leaving time to answer
 * with an error.
 */
export const WAREHOUSE_STATEMENT_TIMEOUT_MS = 50_000

/**
 * Runs a parameterized read query against the Neon warehouse.
 *
 * Uses the Neon HTTP driver directly (not Prisma) because the filter SQL binds
 * array parameters (`= any($n::text[])`), which the HTTP driver handles
 * cleanly. Read-only; callers build queries via lib/dashboard/filtering-sql.
 * Each query runs in a read-only transaction (still one HTTP round trip) so
 * `set local statement_timeout` applies to it alone.
 */
export async function queryWarehouse<T = Record<string, unknown>>(query: SqlQuery): Promise<T[]> {
  const sql = client()
  const [, rows] = await sql.transaction(
    [sql.query(`set local statement_timeout = ${WAREHOUSE_STATEMENT_TIMEOUT_MS}`), sql.query(query.text, query.values)],
    { readOnly: true }
  )
  return rows as T[]
}
