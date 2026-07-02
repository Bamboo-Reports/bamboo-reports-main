import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { PROSPECT_COLUMNS } from "@/lib/dashboard/entity-columns"
import { queryWarehouse } from "@/lib/db/warehouse"

export const dynamic = "force-dynamic"

const logger = createLogger("api/prospects/detail")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** One prospect by ps_unique_key (for favorites and recent-item opens). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "prospects:detail" })
  if (!limited.ok) return limited.response

  const { id: rawId } = await params
  let id: string
  try {
    id = decodeURIComponent(rawId)
  } catch {
    id = rawId
  }
  if (!id.trim()) return json({ error: "Missing prospect id" }, 400)

  try {
    const rows = await queryWarehouse({
      text: `select ${PROSPECT_COLUMNS.join(", ")} from prospects where ps_unique_key = $1 limit 1`,
      values: [id],
    })
    if (rows.length === 0) return json({ error: "Prospect not found" }, 404)
    return json({ prospect: rows[0] })
  } catch (err) {
    logger.error("prospect_detail_failed", { error: err })
    return json({ error: "Failed to load prospect" }, 500)
  }
}
