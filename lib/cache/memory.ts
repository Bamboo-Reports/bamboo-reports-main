/**
 * Tiny in-process TTL cache for the dashboard read endpoints (#249 perf).
 * Responses depend only on the (canonical) filter state, never on the user,
 * so caching per filters-hash is safe across users. Per-instance memory is
 * intentional: single-instance deployment, warehouse data changes only when
 * the ETL runs. A shared store (e.g. Redis) can replace the internals behind
 * getOrCompute without touching callers if that ever changes.
 */

type Entry = { value: unknown; expires: number }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 200

/** TTL for dashboard response caching. Env-tunable; 0 disables caching. */
export function dashboardCacheTtlMs(): number {
  const raw = Number.parseInt(process.env.DASHBOARD_CACHE_TTL_MS ?? "", 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : 10 * 60_000
}

export function clearCache(): void {
  store.clear()
  inflight.clear()
}

/**
 * Returns the cached value for `key`, or computes and caches it. Concurrent
 * calls for the same key share one in-flight computation. `bypassRead` skips
 * the cache read (still writes), so a forced refresh repopulates for everyone.
 * Failed computations are not cached.
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

  const promise = fn()
    .then((value) => {
      store.delete(key)
      store.set(key, { value, expires: Date.now() + ttlMs })
      while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value
        if (oldest === undefined) break
        store.delete(oldest)
      }
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}
