import { getSupabaseServiceRoleClient } from "@/lib/supabase/server"
import { redisConfig, redisPipeline } from "@/lib/cache/redis"
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

// Redis keys live outside the "dash:" response-cache prefix so the ETL's
// post-import purge (dash:*) never resets anyone's budget.
const REDIS_KEY_PREFIX = "rl:"

/**
 * Bumps the window counter in Upstash Redis: INCR plus PEXPIRE in one
 * pipelined round trip. The expiry is re-applied on every hit, which is
 * harmless (the key only needs to outlive its window) and keeps the pair
 * atomic enough for a rate limit without an EVAL script. Returns null on any
 * failure so the caller fails open.
 */
async function incrementInRedis(key: string, windowMs: number): Promise<number | null> {
  const results = await redisPipeline([
    ["INCR", key],
    ["PEXPIRE", key, windowMs + 1000],
  ])
  if (!results) return null
  const count = Number(results[0])
  return Number.isFinite(count) ? count : null
}

/** Bumps the window counter via the Supabase `increment_rate_limit` RPC. */
async function incrementInSupabase(params: EnforceParams, windowStartMs: number): Promise<number | null> {
  const supabase = getSupabaseServiceRoleClient()
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_user_id: params.userId,
    p_bucket: params.bucket,
    p_window_start: new Date(windowStartMs).toISOString(),
  })
  if (error) {
    logger.error("rate_limit_check_failed", { bucket: params.bucket, error })
    return null
  }
  return typeof data === "number" ? data : Number(data ?? 0)
}

/**
 * Per-user, per-bucket fixed-window rate limit.
 *
 * Increments the caller's counter for the current window and returns a ready
 * 429 Response (with Retry-After) once the budget is exceeded. The counter
 * lives in Upstash Redis when the REST credentials are configured (one ~20ms
 * round trip, the same store as the response cache); otherwise it falls back
 * to the Supabase `increment_rate_limit` RPC, which costs a few hundred ms
 * and used to gate every dashboard response. Fails OPEN on any backend error
 * so a transient outage never blocks legitimate traffic; every failure is
 * logged.
 */
export async function enforceRateLimit(params: EnforceParams): Promise<RateLimitOutcome> {
  const max = params.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW
  const windowMs = params.windowMs ?? DEFAULT_WINDOW_MS
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs

  try {
    const count = redisConfig()
      ? await incrementInRedis(`${REDIS_KEY_PREFIX}${params.userId}:${params.bucket}:${windowStartMs}`, windowMs)
      : await incrementInSupabase(params, windowStartMs)

    if (count === null) {
      logger.error("rate_limit_check_failed", { bucket: params.bucket, backend: redisConfig() ? "redis" : "supabase" })
      return { ok: true }
    }

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
