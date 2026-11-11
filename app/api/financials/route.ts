import { authenticateRequest } from "@/lib/auth/request"
import { createLogger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { fetchAccountFinancialInfo } from "@/lib/finance/financial-info"
import { captureServerEvent } from "@/lib/analytics/server"
import { SERVER_ANALYTICS_EVENTS } from "@/lib/analytics/events"

export const dynamic = "force-dynamic"

const logger = createLogger("api/financials")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// Each request fans out to two to four Yahoo Finance calls, so keep the per-user
// budget tighter than the general data endpoints.
const FINANCIALS_MAX_PER_MIN = 20

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const limited = await enforceRateLimit({
    userId,
    bucket: "financials",
    maxPerWindow: FINANCIALS_MAX_PER_MIN,
  })
  if (!limited.ok) return limited.response

  const url = new URL(request.url)
  const ticker = url.searchParams.get("ticker")
  if (!ticker || !ticker.trim()) {
    return json({ success: false, error: "Ticker is missing or invalid", data: null }, 400)
  }

  const result = await fetchAccountFinancialInfo(ticker, url.searchParams.get("country"))
  logger.info("financials_served", { user_id: userId, success: result.success })
  captureServerEvent({
    distinctId: userId,
    event: SERVER_ANALYTICS_EVENTS.FINANCIALS_SERVED,
    properties: { ticker: ticker.trim().toUpperCase(), success: result.success },
  })
  return json(result)
}
