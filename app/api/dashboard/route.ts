import { getDashboardData } from "@/app/actions/data"
import { resolveAuthenticatedUserId, extractBearerToken } from "@/lib/auth/server"
import { createLogger } from "@/lib/logger"
import { getRedis } from "@/lib/redis"
import { promisify } from "node:util"
import { gzip as gzipCb } from "node:zlib"

const gzip = promisify(gzipCb)
const logger = createLogger("api/dashboard")

export const dynamic = "force-dynamic"

// ============================================
// REDIS SWR CACHE
// ============================================

// Redis keys
const CACHE_KEY = "dashboard:v1:json"
const CACHE_TS_KEY = "dashboard:v1:ts"
const REVALIDATING_KEY = "dashboard:v1:revalidating"

// TTL in seconds (Redis uses seconds, not ms)
const CACHE_TTL_S = Math.floor((Number(process.env.DASHBOARD_CACHE_TTL_MS) || 60 * 60 * 1000) / 1000)

// In-memory fallback: holds the last known good gzipped buffer so gzip
// doesn't have to re-run on every HIT when Redis returns raw JSON.
let memGzip: { json: string; buf: Buffer } | null = null

async function getGzipped(json: string): Promise<Buffer> {
  if (memGzip?.json === json) return memGzip.buf
  const buf = await gzip(Buffer.from(json))
  memGzip = { json, buf }
  return buf
}

async function fetchAndCache(): Promise<{ json: string }> {
  const queryStart = Date.now()
  logger.info("dashboard_cache_populate_started")
  const data = await getDashboardData()
  const queryMs = Date.now() - queryStart

  const json = JSON.stringify(data)

  const redis = getRedis()
  if (redis) {
    // Store JSON string + timestamp atomically
    await redis.set(CACHE_KEY, json, { ex: CACHE_TTL_S })
    await redis.set(CACHE_TS_KEY, Date.now(), { ex: CACHE_TTL_S + 3600 })
    await redis.del(REVALIDATING_KEY)
  }

  logger.info("dashboard_cache_populated", {
    query_ms: queryMs,
    raw_mb: Number((json.length / 1024 / 1024).toFixed(1)),
    accounts_count: data.accounts.length,
    centers_count: data.centers.length,
    prospects_count: data.prospects.length,
    locked_prospect_teasers_count: data.lockedProspectTeasers.length,
    redis_available: Boolean(redis),
    error: data.error,
  })

  return { json }
}

async function revalidateInBackground(): Promise<void> {
  const redis = getRedis()
  if (!redis) {
    fetchAndCache().catch((err) =>
      logger.error("dashboard_cache_background_revalidation_failed", { error: err })
    )
    return
  }

  // Use Redis as a distributed lock so only one instance revalidates at a time
  const locked = await redis.set(REVALIDATING_KEY, "1", { ex: 60, nx: true })
  if (!locked) {
    logger.info("dashboard_cache_background_revalidation_already_running")
    return
  }

  logger.info("dashboard_cache_background_revalidation_started")
  fetchAndCache().catch((err) => {
    logger.error("dashboard_cache_background_revalidation_failed", { error: err })
    redis.del(REVALIDATING_KEY).catch(() => {})
  })
}

// ============================================
// HANDLERS
// ============================================

async function requireAuth(request: Request): Promise<Response | null> {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    await resolveAuthenticatedUserId(token)
    return null
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export async function GET(request: Request) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const start = Date.now()
  const acceptEncoding = request.headers.get("accept-encoding") || ""
  const redis = getRedis()

  // ── Try Redis first ──────────────────────────────────────────────────────
  if (redis) {
    const [cachedJson, cachedTs] = await Promise.all([
      redis.get<string>(CACHE_KEY),
      redis.get<string>(CACHE_TS_KEY),
    ])

    if (cachedJson) {
      const ts = cachedTs ? Number(cachedTs) : 0
      const age = ts ? Math.round((Date.now() - ts) / 1000) : 0
      const ttlRemaining = await redis.ttl(CACHE_KEY)

      // STALE: key exists but TTL expired — return immediately, revalidate async
      if (ttlRemaining <= 0) {
        logger.info("dashboard_cache_stale", { age_seconds: age, duration_ms: Date.now() - start })
        revalidateInBackground()
        const gzipped = await getGzipped(cachedJson)
        return buildResponse(gzipped, cachedJson, acceptEncoding, "STALE", age)
      }

      // HIT: fresh data from Redis
      logger.info("dashboard_cache_hit", {
        age_seconds: age,
        ttl_remaining_s: ttlRemaining,
        duration_ms: Date.now() - start,
      })
      const gzipped = await getGzipped(cachedJson)
      return buildResponse(gzipped, cachedJson, acceptEncoding, "HIT", age)
    }
  } else {
    logger.warn("dashboard_redis_unavailable_falling_back_to_db")
  }

  // ── Cache MISS: fetch from DB, store in Redis, return ────────────────────
  logger.info("dashboard_cache_miss")
  const { json } = await fetchAndCache()
  logger.info("dashboard_cache_miss_completed", { duration_ms: Date.now() - start })

  const gzipped = await getGzipped(json)
  return buildResponse(gzipped, json, acceptEncoding, "MISS", 0)
}

/**
 * POST handler to invalidate the cache.
 * Accepts two auth paths:
 *   1. Supabase user JWT  — used by the browser client before a force-refresh.
 *   2. ETL_CACHE_BUST_SECRET — a static server-to-server secret used by the
 *      ETL pipeline after a data import. No Supabase dependency required.
 */
export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  // ── Path 1: ETL shared secret (no Supabase round-trip needed) ──────────
  const etlSecret = process.env.ETL_CACHE_BUST_SECRET
  const isEtlSecret = etlSecret && token === etlSecret

  // ── Path 2: Supabase user JWT (existing browser-client flow) ───────────
  if (!isEtlSecret) {
    const authError = await requireAuth(request)
    if (authError) return authError
  }

  const redis = getRedis()
  if (redis) {
    await Promise.all([
      redis.del(CACHE_KEY),
      redis.del(CACHE_TS_KEY),
      redis.del(REVALIDATING_KEY),
    ])
    logger.info("dashboard_cache_invalidated", {
      store: "redis",
      caller: isEtlSecret ? "etl" : "client",
    })
  } else {
    logger.warn("dashboard_cache_invalidate_redis_unavailable")
  }

  // Also clear the local gzip memo
  memGzip = null

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  })
}

// ============================================
// HELPERS
// ============================================

function buildResponse(
  gzipped: Buffer,
  json: string,
  acceptEncoding: string,
  cacheStatus: "HIT" | "MISS" | "STALE",
  age: number
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cache": cacheStatus,
    "X-Cache-Age": String(age),
  }

  if (acceptEncoding.includes("gzip")) {
    return new Response(new Uint8Array(gzipped), {
      headers: { ...headers, "Content-Encoding": "gzip" },
    })
  }

  return new Response(json, { headers })
}
