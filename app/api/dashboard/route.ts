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
// HYBRID CACHE STRATEGY
//
// Problem: Dashboard JSON is ~60MB+ raw — too large for Redis's 10MB per-request limit.
//
// Solution: Split responsibilities —
//   - In-memory: stores the actual data (fast, no size limits)
//   - Redis:     stores a small "valid" signal key (distributed invalidation across all instances)
//
// Flow:
//   GET  → check Redis signal → if missing, local cache is stale → re-fetch from DB
//        → if present,       → serve from local memory instantly
//
//   POST → delete Redis signal → all instances see "signal gone" on next request
//        → each instance re-fetches from DB independently and re-warms its local cache
// ============================================

// Redis key — small string, well within size limits
const SIGNAL_KEY = "dashboard:v1:valid"
const REVALIDATING_KEY = "dashboard:v1:revalidating"
const CACHE_TTL_S = Math.floor((Number(process.env.DASHBOARD_CACHE_TTL_MS) || 60 * 60 * 1000) / 1000)

// In-memory store — per-instance, large payload lives here
let mem: {
  gzipped: Buffer | null
  json: string | null
  timestamp: number
  revalidating: boolean
} = {
  gzipped: null,
  json: null,
  timestamp: 0,
  revalidating: false,
}

async function fetchAndCache(): Promise<{ gzipped: Buffer; json: string }> {
  const queryStart = Date.now()
  logger.info("dashboard_cache_populate_started")
  const data = await getDashboardData()
  const queryMs = Date.now() - queryStart

  const json = JSON.stringify(data)
  const compressStart = Date.now()
  const gzipped = await gzip(Buffer.from(json))
  const compressMs = Date.now() - compressStart

  // Store data locally in this instance's memory
  mem = { gzipped, json, timestamp: Date.now(), revalidating: false }

  // Set the Redis "valid" signal — small key, no size issues
  const redis = getRedis()
  if (redis) {
    await redis.set(SIGNAL_KEY, Date.now(), { ex: CACHE_TTL_S })
    await redis.del(REVALIDATING_KEY)
  }

  logger.info("dashboard_cache_populated", {
    query_ms: queryMs,
    gzip_ms: compressMs,
    raw_mb: Number((json.length / 1024 / 1024).toFixed(1)),
    compressed_mb: Number((gzipped.length / 1024 / 1024).toFixed(1)),
    accounts_count: data.accounts.length,
    centers_count: data.centers.length,
    prospects_count: data.prospects.length,
    locked_prospect_teasers_count: data.lockedProspectTeasers.length,
    redis_available: Boolean(redis),
    error: data.error,
  })

  return { gzipped, json }
}

async function revalidateInBackground(): Promise<void> {
  if (mem.revalidating) return

  const redis = getRedis()
  if (redis) {
    // Distributed lock: only one instance revalidates at a time
    const locked = await redis.set(REVALIDATING_KEY, "1", { ex: 60, nx: true })
    if (!locked) {
      logger.info("dashboard_cache_background_revalidation_already_running")
      return
    }
  }

  mem.revalidating = true
  logger.info("dashboard_cache_background_revalidation_started")
  fetchAndCache().catch((err) => {
    logger.error("dashboard_cache_background_revalidation_failed", { error: err })
    mem.revalidating = false
    getRedis()?.del(REVALIDATING_KEY).catch(() => {})
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

  // ── Check Redis signal (tiny key, no size issues) ────────────────────────
  let redisSignalValid = false
  if (redis) {
    try {
      const signal = await redis.get(SIGNAL_KEY)
      redisSignalValid = signal !== null
    } catch (err) {
      logger.warn("dashboard_redis_signal_check_failed", { error: err })
    }
  } else {
    logger.warn("dashboard_redis_unavailable_falling_back_to_memory")
  }

  const hasLocalCache = mem.gzipped !== null && mem.json !== null
  const age = mem.timestamp ? Math.round((Date.now() - mem.timestamp) / 1000) : 0

  // ── HIT: Redis signal valid + local data present ─────────────────────────
  if (redisSignalValid && hasLocalCache) {
    logger.info("dashboard_cache_hit", {
      age_seconds: age,
      duration_ms: Date.now() - start,
    })
    return buildResponse(mem.gzipped!, mem.json!, acceptEncoding, "HIT", age)
  }

  // ── STALE: Redis signal gone but local data exists → serve stale, revalidate ──
  if (!redisSignalValid && hasLocalCache) {
    logger.info("dashboard_cache_stale", {
      age_seconds: age,
      duration_ms: Date.now() - start,
    })
    revalidateInBackground()
    return buildResponse(mem.gzipped!, mem.json!, acceptEncoding, "STALE", age)
  }

  // ── MISS: no local data → fetch from DB ──────────────────────────────────
  logger.info("dashboard_cache_miss")
  const { gzipped, json } = await fetchAndCache()
  logger.info("dashboard_cache_miss_completed", { duration_ms: Date.now() - start })

  return buildResponse(gzipped, json, acceptEncoding, "MISS", 0)
}

/**
 * POST handler to invalidate the cache.
 * Accepts two auth paths:
 *   1. ETL_CACHE_BUST_SECRET — server-to-server secret used by the ETL pipeline.
 *   2. Supabase user JWT     — used by the browser client before a force-refresh.
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

  // Delete the Redis signal → all instances will see stale on next request
  const redis = getRedis()
  if (redis) {
    await Promise.all([
      redis.del(SIGNAL_KEY),
      redis.del(REVALIDATING_KEY),
    ])
    logger.info("dashboard_cache_invalidated", {
      store: "redis_signal",
      caller: isEtlSecret ? "etl" : "client",
    })
  }

  // Also clear this instance's local memory immediately
  mem = { gzipped: null, json: null, timestamp: 0, revalidating: false }

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
