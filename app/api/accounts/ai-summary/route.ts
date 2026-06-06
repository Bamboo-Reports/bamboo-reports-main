import { z } from "zod"
import { buildAccountSummaryContext } from "@/lib/ai/account-summary-context"
import { generateAccountSummary } from "@/lib/ai/account-summary-generator"
import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { createLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const logger = createLogger("api/accounts/ai-summary")
const requestSchema = z.object({
  accountName: z.string().trim().min(1).max(300),
})

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

export async function POST(request: Request) {
  if (process.env.AI_ACCOUNT_SUMMARY_ENABLED === "false") {
    return json({ error: "AI account summaries are disabled." }, 503)
  }

  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)

  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ error: "Invalid request body" }, 400)
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return json({ error: "OpenRouter is not configured for this environment." }, 503)
  }

  const startedAt = Date.now()
  try {
    const context = await buildAccountSummaryContext(parsed.data.accountName)
    if (!context) {
      return json({ error: "Account not found" }, 404)
    }

    const result = await generateAccountSummary(context)
    logger.info("generation_succeeded", {
      user_id: userId,
      account_name: parsed.data.accountName,
      model: result.model,
      duration_ms: Date.now() - startedAt,
    })
    return json(result)
  } catch (error) {
    logger.error("generation_failed", {
      user_id: userId,
      account_name: parsed.data.accountName,
      duration_ms: Date.now() - startedAt,
      error,
    })
    return json({ error: "Unable to generate the AI account brief." }, 500)
  }
}
