import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { computeCharts } from "@/lib/dashboard/dashboard-core"

export const dynamic = "force-dynamic"
// Warehouse aggregations can be slow on a cold cache; allow up to 60s on Vercel.
export const maxDuration = 60

const logger = createLogger("api/dashboard/charts")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  // Not awaited yet: the RPC runs while the body parses and the (usually
  // cached) compute happens; the outcome gates the response below.
  const limitedPromise = enforceRateLimit({ userId, bucket: "dashboard:charts" })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }
  const filters = parseFilters((rawBody as { filters?: unknown })?.filters)
  // full=true returns every bucket uncapped (used by the summary PDF report).
  const full = (rawBody as { full?: unknown })?.full === true
  const access = resolveAccess()

  try {
    const body = await computeCharts(filters, access, { full, bypassRead: request.headers.get("x-no-cache") === "1" })
    const limited = await limitedPromise
    if (!limited.ok) return limited.response
    return json(body)
  } catch (err) {
    logger.error("charts_failed", { error: err })
    return json({ error: "Failed to compute charts" }, 500)
  }
}
