import { getDashboardData } from "@/app/actions/data"
import { resolveAuthenticatedUserId, extractBearerToken } from "@/lib/auth/server"
import { promisify } from "node:util"
import { gzip as gzipCb } from "node:zlib"

const gzip = promisify(gzipCb)

export const dynamic = "force-dynamic"

// ============================================
// IN-MEMORY SWR CACHE
// ============================================

const CACHE_TTL = Number(process.env.DASHBOARD_CACHE_TTL_MS) || 5 * 60 * 1000 // 5 minutes

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

  console.log(`[Cache] Populated: DB ${queryMs}ms, gzip ${compressMs}ms, raw ${(json.length / 1024 / 1024).toFixed(1)}MB, compressed ${(gzipped.length / 1024 / 1024).toFixed(1)}MB`)

  return { gzipped, json }
}

function revalidateInBackground() {
  if (cache.revalidating) return
  cache.revalidating = true
  console.log("[Cache] Stale — revalidating in background")
  fetchAndCache().catch((err) => {
    console.error("[Cache] Background revalidation failed:", err)
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
    return null // authenticated
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

  // Cache HIT — fresh data, return immediately
  if (isFresh && cache.gzipped && cache.json) {
    console.log(`[Cache] HIT (age: ${age}s, TTL: ${CACHE_TTL / 1000}s) — ${Date.now() - start}ms`)
    return buildResponse(cache.gzipped, cache.json, acceptEncoding, "HIT", age)
  }

  // Cache STALE — return stale data immediately, revalidate in background
  if (isStale && cache.gzipped && cache.json) {
    console.log(`[Cache] STALE (age: ${age}s, TTL: ${CACHE_TTL / 1000}s) — ${Date.now() - start}ms`)
    revalidateInBackground()
    return buildResponse(cache.gzipped, cache.json, acceptEncoding, "STALE", age)
  }

  // Cache MISS — fetch from DB, cache, return
  console.log("[Cache] MISS — fetching from database")
  const { gzipped, json } = await fetchAndCache()
  console.log(`[Cache] MISS total: ${Date.now() - start}ms`)

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
  console.log("[Cache] Invalidated via POST")
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
