import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { sortEngagements } from "@/lib/dashboard/engagements"
import type { ProspectEngagement } from "@/lib/types"

export const dynamic = "force-dynamic"

const logger = createLogger("api/prospects/engagements")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Bamboo Reports campaign touchpoints for one prospect (by ps_unique_key),
 * oldest first, for the prospect dialog's timeline. subscribers links to
 * prospects only by email, matched case-insensitively.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "prospects:engagements" })
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
    const rows = await queryWarehouse<ProspectEngagement>({
      text: `select prospect_engaged_date, prospect_engaged_campaign from subscribers
        where lower(prospect_email) = (select lower(prospect_email) from prospects where ps_unique_key = $1 limit 1)`,
      values: [id],
    })
    return json({ engagements: sortEngagements(rows) })
  } catch (err) {
    logger.error("prospect_engagements_failed", { error: err })
    return json({ error: "Failed to load engagements" }, 500)
  }
}
