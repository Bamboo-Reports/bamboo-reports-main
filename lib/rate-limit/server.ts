import { getSupabaseServiceRoleClient } from "@/lib/supabase/server"
import { createLogger } from "@/lib/logger"

const logger = createLogger("rate-limit")

// Default per-user request budget per rolling window, env-tunable to match the
// EXPORT_RATE_LIMIT_PER_HOUR convention. Individual callers can override.
const parsedPerMin = Number.parseInt(process.env.DATA_RATE_LIMIT_PER_MIN ?? "", 10)
const DEFAULT_MAX_PER_WINDOW =
  Number.isFinite(parsedPerMin) && parsedPerMin > 0 ? parsedPerMin : 60
const DEFAULT_WINDOW_MS = 60 * 1000

export type RateLimitOutcome = { ok: true } | { ok: false; response: Response }

type EnforceParams = {
  userId: string
  // Stable identifier for the limited surface, e.g. "dashboard:get".
  bucket: string
  // Max requests allowed within the window before a 429 is returned.
  maxPerWindow?: number
  // Rolling window size in milliseconds.
  windowMs?: number
}

/**
 * Per-user, per-bucket fixed-window rate limit backed by Supabase.
 *
 * Increments the caller's counter for the current window and returns a ready
 * 429 Response (with Retry-After) once the budget is exceeded. Fails OPEN on
 * any backend error so a transient DB issue never blocks legitimate traffic;
 * every failure is logged.
 */
export async function enforceRateLimit(params: EnforceParams): Promise<RateLimitOutcome> {
  const max = params.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW
  const windowMs = params.windowMs ?? DEFAULT_WINDOW_MS
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs
  const windowStart = new Date(windowStartMs)

  try {
    const supabase = getSupabaseServiceRoleClient()
    const { data, error } = await supabase.rpc("increment_rate_limit", {
      p_user_id: params.userId,
      p_bucket: params.bucket,
      p_window_start: windowStart.toISOString(),
    })

    if (error) {
      logger.error("rate_limit_check_failed", { bucket: params.bucket, error })
      return { ok: true }
    }

    const count = typeof data === "number" ? data : Number(data ?? 0)
    if (count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((windowStartMs + windowMs - Date.now()) / 1000))
      logger.warn("rate_limit_exceeded", {
        bucket: params.bucket,
        user_id: params.userId,
        count,
        max,
      })
      return { ok: false, response: tooManyRequests(retryAfterSec) }
    }

    return { ok: true }
  } catch (err) {
    logger.error("rate_limit_error", { bucket: params.bucket, error: err })
    return { ok: true }
  }
}

function tooManyRequests(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  )
}
