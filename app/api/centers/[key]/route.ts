import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { CENTER_COLUMNS, SERVICE_COLUMNS, TECH_COLUMNS } from "@/lib/dashboard/entity-columns"
import { queryWarehouse } from "@/lib/db/warehouse"

export const dynamic = "force-dynamic"

const logger = createLogger("api/centers/detail")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** One center by cn_unique_key, with its services and tech rows (for the center dialog and favorites). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "centers:detail" })
  if (!limited.ok) return limited.response

  const { key: rawKey } = await params
  let key: string
  try {
    key = decodeURIComponent(rawKey)
  } catch {
    key = rawKey
  }
  if (!key.trim()) return json({ error: "Missing center key" }, 400)

  try {
    const values = [key]
    const [centers, services, tech] = await Promise.all([
      queryWarehouse({ text: `select ${CENTER_COLUMNS.join(", ")} from centers where cn_unique_key = $1 limit 1`, values }),
      queryWarehouse({ text: `select ${SERVICE_COLUMNS.join(", ")} from services where cn_unique_key = $1`, values }),
      queryWarehouse({ text: `select ${TECH_COLUMNS.join(", ")} from tech where cn_unique_key = $1`, values }),
    ])
    if (centers.length === 0) return json({ error: "Center not found" }, 404)
    return json({ center: centers[0], services, tech })
  } catch (err) {
    logger.error("center_detail_failed", { error: err })
    return json({ error: "Failed to load center" }, 500)
  }
}
