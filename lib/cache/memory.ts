/**
 * Two-layer TTL cache for the dashboard read endpoints (#249 perf).
 * Responses depend only on the (canonical) filter state, never on the user,
 * so caching per filters-hash is safe across users.
 *
 * L1 is an in-process Map (fast, per-instance). When Upstash Redis REST
 * credentials are present in the environment, a shared L2 sits behind it so
 * cache hits survive across serverless instances (prod runs on Vercel, where
 * each instance has private memory). Without the credentials the behavior is
 * exactly the in-process cache as before.
 */

import { redisCommand, redisConfig } from "@/lib/cache/redis"

type Entry = { value: unknown; expires: number }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 200
// With Redis behind it, L1 entries are re-validated against Redis at most
// this often, so an external purge (e.g. the ETL after an import) reaches
// warm instances within minutes even under a long TTL. Without Redis, the
// memory cache is the only layer and honors the full TTL.
const L1_MAX_RESIDENCY_MS = 5 * 60_000

/** TTL for dashboard response caching. Env-tunable; 0 disables caching. */
export function dashboardCacheTtlMs(): number {
  const raw = Number.parseInt(process.env.DASHBOARD_CACHE_TTL_MS ?? "", 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : 10 * 60_000
}

// ---------------------------------------------------------------------------
// Upstash Redis REST (optional shared L2), via the shared client in redis.ts.
// ---------------------------------------------------------------------------

/**
 * Production, previews and local dev share one Upstash database, so keys are
 * namespaced by environment and deployment (#316): a preview or local run must
 * not read production's responses, nor write results from other code or data
 * that production would then serve. Including the commit also keeps a new
 * deploy from serving responses computed by the previous code. The leading
 * "dash:" is what the ETL's post-import purge matches (etl/importer/cache.py).
 */
function redisKey(key: string): string {
  const env = process.env.VERCEL_ENV || "local"
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev"
  return `dash:${env}:${commit}:${key}`
}

async function redisGet(key: string): Promise<Entry | null> {
  const raw = await redisCommand(["GET", redisKey(key)])
  if (typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw) as Entry
    if (typeof parsed?.expires !== "number" || parsed.expires <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

async function redisSet(key: string, entry: Entry, ttlMs: number): Promise<void> {
  await redisCommand(["SET", redisKey(key), JSON.stringify(entry), "PX", ttlMs])
}

// ---------------------------------------------------------------------------

export function clearCache(): void {
  store.clear()
  inflight.clear()
}

function storeInMemory(key: string, entry: Entry, capResidency: boolean): void {
  const expires = capResidency ? Math.min(entry.expires, Date.now() + L1_MAX_RESIDENCY_MS) : entry.expires
  store.delete(key)
  store.set(key, { ...entry, expires })
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

/**
 * Returns the cached value for `key`, or computes and caches it. Concurrent
 * calls for the same key share one in-flight computation. `bypassRead` skips
 * the cache reads (still writes), so a forced refresh repopulates for
 * everyone. Failed computations are not cached; Redis failures fall through
 * to computing (fail open).
 */
export async function getOrCompute<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: { bypassRead?: boolean } = {}
): Promise<T> {
  if (ttlMs <= 0) return fn()

  if (!opts.bypassRead) {
    const hit = store.get(key)
    if (hit && hit.expires > Date.now()) {
      // Refresh recency so eviction drops the least recently used key.
      store.delete(key)
      store.set(key, hit)
      return hit.value as T
    }
    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>
  }

  // Checked synchronously so that without Redis, fn() starts immediately
  // (callers may rely on it being invoked before this function returns).
  const useRedis = redisConfig() !== null

  const promise = (async () => {
    if (useRedis && !opts.bypassRead) {
      const shared = await redisGet(key)
      if (shared) {
        storeInMemory(key, shared, true)
        return shared.value as T
      }
    }
    const value = await fn()
    const entry: Entry = { value, expires: Date.now() + ttlMs }
    storeInMemory(key, entry, useRedis)
    // Awaited (not fire-and-forget): serverless instances can freeze right
    // after the response, which would drop a dangling write.
    if (useRedis) await redisSet(key, entry, ttlMs)
    return value
  })().finally(() => {
    // A forced refresh (bypassRead) may have replaced this entry while it ran;
    // only remove the key if it still points at this computation (#292).
    if (inflight.get(key) === promise) inflight.delete(key)
  })

  inflight.set(key, promise)
  return promise
}
