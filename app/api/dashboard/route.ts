import { getDashboardData } from "@/app/actions/data"
import { resolveAuthenticatedUserId, extractBearerToken } from "@/lib/auth/server"
import { createLogger } from "@/lib/logger"
import { promisify } from "node:util"
import { gzip as gzipCb } from "node:zlib"

const gzip = promisify(gzipCb)
const logger = createLogger("api/dashboard")

export const dynamic = "force-dynamic"

// ============================================
// IN-MEMORY SWR CACHE
// ============================================

const CACHE_TTL = Number(process.env.DASHBOARD_CACHE_TTL_MS) || 60 * 60 * 1000 // 1 hour

let cache: {
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

async function fetchAndCache() {
  const queryStart = Date.now()
  logger.info("dashboard_cache_populate_started")
  const data = await getDashboardData()
  const queryMs = Date.now() - queryStart

  const json = JSON.stringify(data)
  const compressStart = Date.now()
  const gzipped = await gzip(Buffer.from(json))
  const compressMs = Date.now() - compressStart

  cache = {
    gzipped,
    json,
    timestamp: Date.now(),
    revalidating: false,
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
    error: data.error,
  })

  return { gzipped, json }
}

function revalidateInBackground() {
  if (cache.revalidating) return
  cache.revalidating = true
  logger.info("dashboard_cache_background_revalidation_started")
  fetchAndCache().catch((err) => {
    logger.error("dashboard_cache_background_revalidation_failed", { error: err })
    cache.revalidating = false
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
  const age = cache.timestamp ? Math.round((Date.now() - cache.timestamp) / 1000) : 0
  const isFresh = cache.timestamp > 0 && Date.now() - cache.timestamp < CACHE_TTL
  const isStale = cache.timestamp > 0 && !isFresh

  // Cache HIT: fresh data, return immediately
  if (isFresh && cache.gzipped && cache.json) {
    logger.info("dashboard_cache_hit", {
      age_seconds: age,
      ttl_seconds: CACHE_TTL / 1000,
      duration_ms: Date.now() - start,
    })
    return buildResponse(cache.gzipped, cache.json, acceptEncoding, "HIT", age)
  }

  // Cache STALE: return stale data immediately, revalidate in background
  if (isStale && cache.gzipped && cache.json) {
    logger.info("dashboard_cache_stale", {
      age_seconds: age,
      ttl_seconds: CACHE_TTL / 1000,
      duration_ms: Date.now() - start,
    })
    revalidateInBackground()
    return buildResponse(cache.gzipped, cache.json, acceptEncoding, "STALE", age)
  }

  // Cache MISS: fetch from DB, cache, return
  logger.info("dashboard_cache_miss")
  const { gzipped, json } = await fetchAndCache()
  logger.info("dashboard_cache_miss_completed", { duration_ms: Date.now() - start })

  return buildResponse(gzipped, json, acceptEncoding, "MISS", 0)
}

/**
 * POST handler to invalidate the cache.
 * Called by the client before a force-refresh.
 */
export async function POST(request: Request) {
  const authError = await requireAuth(request)
  if (authError) return authError

  cache = { gzipped: null, json: null, timestamp: 0, revalidating: false }
  logger.info("dashboard_cache_invalidated")
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
