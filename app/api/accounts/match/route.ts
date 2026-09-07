import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"
import {
  buildAccountIndexQuery,
  buildAccountMatchIndex,
  buildAliasIndexQuery,
  matchAccountList,
  parseMatchRequestNames,
  type AccountIndexRow,
  type AccountMatchIndex,
  type AliasIndexRow,
} from "@/lib/accounts/account-match"

export const dynamic = "force-dynamic"

const logger = createLogger("api/accounts/match")

// The name index only changes on the weekly ETL import, which clears the
// in-memory cache; 24h bounds staleness if that purge is ever skipped.
const INDEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

async function loadIndex(bypassRead: boolean): Promise<AccountMatchIndex> {
  return getOrCompute(
    "account-match:index",
    dashboardCacheTtlMs() === 0 ? 0 : INDEX_CACHE_TTL_MS,
    async () => {
      const [accounts, aliases] = await Promise.all([
        queryWarehouse<AccountIndexRow>(buildAccountIndexQuery()),
        queryWarehouse<AliasIndexRow>(buildAliasIndexQuery()),
      ])
      return buildAccountMatchIndex(accounts, aliases)
    },
    { bypassRead }
  )
}

/**
 * POST { names: string[] } -> { results: AccountMatchResult[] }
 *
 * Maps a client-provided list of company names onto warehouse accounts so the
 * user can review the mapping and save it as a filter.
 */
export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limitedPromise = enforceRateLimit({ userId, bucket: "accounts:match", maxPerWindow: 20 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }
  const parsed = parseMatchRequestNames(body)
  if ("error" in parsed) return json({ error: parsed.error }, 400)

  try {
    const index = await loadIndex(request.headers.get("x-no-cache") === "1")
    const results = matchAccountList(parsed.names, index)
    const limited = await limitedPromise
    if (!limited.ok) return limited.response
    return json({ results })
  } catch (err) {
    logger.error("account_match_failed", { error: err })
    return json({ error: "Account matching failed" }, 500)
  }
}
