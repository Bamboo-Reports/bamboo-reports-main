import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { resolveAccess } from "@/lib/dashboard/filters-request"
import { getAccountRelated } from "@/lib/dashboard/account-related"

export const dynamic = "force-dynamic"

const logger = createLogger("api/accounts/related")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Per-account detail payload for the account dialog: the account row plus its
 * centers, services, tech, and access-partitioned prospects.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "accounts:related" })
  if (!limited.ok) return limited.response

  const { name: rawName } = await params
  let name: string
  try {
    name = decodeURIComponent(rawName)
  } catch {
    name = rawName
  }
  if (!name.trim()) return json({ error: "Missing account name" }, 400)

  try {
    const result = await getAccountRelated(name, resolveAccess())
    if (!result.account && result.centers.length === 0 && result.prospects.length === 0 && result.tech.length === 0) {
      return json({ error: "Account not found" }, 404)
    }
    return json(result)
  } catch (err) {
    logger.error("account_related_failed", { error: err })
    return json({ error: "Failed to load account details" }, 500)
  }
}
