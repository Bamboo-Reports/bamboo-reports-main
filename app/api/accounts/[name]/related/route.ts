import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { resolveAccess } from "@/lib/dashboard/filters-request"
import { getAccountRelated } from "@/lib/dashboard/account-related"
import { dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"

export const dynamic = "force-dynamic"

const logger = createLogger("api/accounts/related")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Per-account detail payload for the account dialog: the account row plus its
 * centers, services, tech, and access-partitioned prospects.
 *
 * The payload depends only on the account name and the deployment's section
 * entitlements, never on the user, so it is cached under the shared dash:*
 * namespace like the filter endpoints (the ETL purge invalidates it). Accounts
 * with many prospects produce a payload around 1MB, so a cache hit saves the
 * warehouse round trips and the serialisation on every reopen.
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
  // Not awaited yet: the counter bumps while the (usually cached) payload is
  // fetched; the outcome gates the response below.
  const limitedPromise = enforceRateLimit({ userId, bucket: "accounts:related" })

  const { name: rawName } = await params
  let name: string
  try {
    name = decodeURIComponent(rawName)
  } catch {
    name = rawName
  }
  if (!name.trim()) return json({ error: "Missing account name" }, 400)

  try {
    const result = await getOrCompute(
      `related:${name}`,
      dashboardCacheTtlMs(),
      () => getAccountRelated(name, resolveAccess()),
      { bypassRead: request.headers.get("x-no-cache") === "1" }
    )
    const limited = await limitedPromise
    if (!limited.ok) return limited.response
    if (!result.account && result.centers.length === 0 && result.prospects.length === 0 && result.tech.length === 0) {
      return json({ error: "Account not found" }, 404)
    }
    return json(result)
  } catch (err) {
    logger.error("account_related_failed", { error: err })
    return json({ error: "Failed to load account details" }, 500)
  }
}
