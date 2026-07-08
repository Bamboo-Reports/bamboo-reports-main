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
// Upstash Redis REST (optional shared L2). Plain fetch, no dependencies.
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = "dash:"
const REDIS_TIMEOUT_MS = 1500

let warnedRedisFailure = false

/** Env-gated Upstash config, read per call so serverless env changes apply. */
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url, token } : null
}

/** Runs one Redis command; returns its `result` or null on any failure. */
async function redisCommand(command: (string | number)[]): Promise<unknown> {
  const config = redisConfig()
  if (!config) return null
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Redis responded ${response.status}`)
    const body = (await response.json()) as { result?: unknown; error?: string }
    if (body.error) throw new Error(body.error)
    return body.result ?? null
  } catch (error) {
    if (!warnedRedisFailure) {
      warnedRedisFailure = true
      console.warn("[cache] Redis unavailable, serving without shared cache:", error)
    }
    return null
  }
}

async function redisGet(key: string): Promise<Entry | null> {
  const raw = await redisCommand(["GET", REDIS_KEY_PREFIX + key])
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
  await redisCommand(["SET", REDIS_KEY_PREFIX + key, JSON.stringify(entry), "PX", ttlMs])
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
    inflight.delete(key)
  })

  inflight.set(key, promise)
  return promise
}
