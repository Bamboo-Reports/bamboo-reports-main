import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { createLogger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { fetchAccountFinancialInfo } from "@/lib/finance/financial-info"

export const dynamic = "force-dynamic"

const logger = createLogger("api/financials")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// Each request fans out to four Yahoo Finance calls, so keep the per-user
// budget tighter than the general data endpoints.
const FINANCIALS_MAX_PER_MIN = 20

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)

  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }

  const limited = await enforceRateLimit({
    userId,
    bucket: "financials",
    maxPerWindow: FINANCIALS_MAX_PER_MIN,
  })
  if (!limited.ok) return limited.response

  const ticker = new URL(request.url).searchParams.get("ticker")
  if (!ticker || !ticker.trim()) {
    return json({ success: false, error: "Ticker is missing or invalid", data: null }, 400)
  }

  const result = await fetchAccountFinancialInfo(ticker)
  logger.info("financials_served", { user_id: userId, success: result.success })
  return json(result)
}
