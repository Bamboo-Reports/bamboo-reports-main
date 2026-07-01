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
 * Runs a parameterized read query against the Neon warehouse.
 *
 * Uses the Neon HTTP driver directly (not Prisma) because the filter SQL binds
 * array parameters (`= any($n::text[])`), which the HTTP driver handles
 * cleanly. Read-only; callers build queries via lib/dashboard/filtering-sql.
 */
export async function queryWarehouse<T = Record<string, unknown>>(query: SqlQuery): Promise<T[]> {
  const rows = await client().query(query.text, query.values)
  return rows as T[]
}
