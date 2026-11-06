import { authenticateRequest } from "@/lib/auth/request"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { getAccountRelated } from "@/lib/dashboard/account-related"
import { dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"

export const dynamic = "force-dynamic"

const logger = createLogger("api/accounts/related")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Per-account detail payload for the account dialog: the account row plus its
 * centers, services, tech, and prospects.
 *
 * The payload depends only on the account name, never on the user, so it is
 * cached under the shared dash:* namespace like the filter endpoints (the ETL
 * purge invalidates it). Accounts
 * with many prospects produce a payload around 1MB, so a cache hit saves the
 * warehouse round trips and the serialisation on every reopen.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateRequest(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  // Started now so the counter round trip overlaps the request parsing below;
  // awaited before any warehouse work so an over-limit caller never reaches it.
  const limitedPromise = enforceRateLimit({ userId, bucket: "accounts:related" })

  const { name: rawName } = await params
  let name: string
  const limited = await limitedPromise
  if (!limited.ok) return limited.response

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
      () => getAccountRelated(name),
      { bypassRead: request.headers.get("x-no-cache") === "1" }
    )
    if (!result.account && result.centers.length === 0 && result.prospects.length === 0 && result.tech.length === 0) {
      return json({ error: "Account not found" }, 404)
    }
    return json(result)
  } catch (err) {
    logger.error("account_related_failed", { error: err })
    return json({ error: "Failed to load account details" }, 500)
  }
}
