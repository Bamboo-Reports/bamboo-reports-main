import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { computeFacets, computeSummary } from "@/lib/dashboard/dashboard-core"

export const dynamic = "force-dynamic"
// Warehouse aggregations can be slow on a cold cache; allow up to 60s on Vercel.
export const maxDuration = 60

const logger = createLogger("api/dashboard/core")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Summary cards + sidebar facets in one request. The dashboard always needs
 * both, so fetching them together halves the per-request overhead (auth,
 * rate limit, cache lookups) on every filter change. Each half is cached
 * under the same keys as /api/dashboard/summary and /api/dashboard/facets.
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
  // Not awaited yet: the counter bumps while the body parses and the (usually
  // cached) compute happens; the outcome gates the response below.
  const limitedPromise = enforceRateLimit({ userId, bucket: "dashboard:core" })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }
  const filters = parseFilters((rawBody as { filters?: unknown })?.filters)
  const access = resolveAccess()
  const opts = { bypassRead: request.headers.get("x-no-cache") === "1" }

  try {
    const [summary, facets] = await Promise.all([computeSummary(filters, access, opts), computeFacets(filters, access, opts)])
    const limited = await limitedPromise
    if (!limited.ok) return limited.response
    return json({ summary, facets })
  } catch (err) {
    logger.error("core_failed", { error: err })
    return json({ error: "Failed to compute dashboard data" }, 500)
  }
}
