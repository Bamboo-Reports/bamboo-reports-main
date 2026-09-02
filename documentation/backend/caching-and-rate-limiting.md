# Caching and Rate Limiting

> **Scope:** Server-side response caching (two-tier memory + Upstash Redis, plus the route-local `/api/dashboard` SWR cache), cache invalidation (manual purge and ETL post-import purge), and per-user rate limiting across the API routes.

---

## Two caching mechanisms

The app has two distinct server caches. Do not conflate them.

| Cache | Code | Used by | Storage |
|-------|------|---------|---------|
| Route-local SWR payload cache | `app/api/dashboard/route.ts` | `GET /api/dashboard` only (the full gzipped dashboard payload) | Module-level variable, per instance, memory only |
| Shared two-tier cache | `lib/cache/memory.ts` (`getOrCompute`) | Filter-state endpoints: summary, facets, charts, centers map, entity queries, search, autocomplete | L1 in-process Map + optional L2 Upstash Redis |

The SWR cache predates the two-tier cache and is documented in [`api-caching-swr.md`](api-caching-swr.md). The rest of this section covers the two-tier cache.

## Two-tier cache (`lib/cache/memory.ts`)

Responses on these endpoints depend only on the canonical filter state, never on the user, so caching per filters-hash is safe across users (#249 perf work).

### Read/write path

```
getOrCompute(key, ttlMs, fn, { bypassRead? })
  ├─ ttlMs <= 0            → fn() directly, no caching
  ├─ L1 hit (unexpired)    → return, refresh LRU recency
  ├─ in-flight same key    → await the shared promise (dedup)
  ├─ L2 GET dash:<key>     → on hit: store in L1 (residency-capped), return
  └─ fn()                  → store in L1, awaited SET to L2 (PX ttl), return
```

- Concurrent calls for one key share a single in-flight computation.
- `bypassRead: true` (set when the client sends `x-no-cache: 1`) skips both reads but still writes, so a forced refresh repopulates the cache for everyone.
- Failed computations are never cached.
- The Redis `SET` is awaited, not fire-and-forget: serverless instances can freeze right after responding, which would drop a dangling write.

### L1 details

| Property | Value |
|----------|-------|
| Structure | In-process `Map`, per serverless instance |
| Capacity | 200 entries, least-recently-used eviction |
| Residency cap | 5 minutes, applied only when Redis is configured |

The residency cap means an L1 entry is re-validated against Redis at most every 5 minutes, so an external purge (the ETL after an import) reaches warm instances within minutes even under the 8-day TTL. Without Redis, L1 is the only layer and honors the full TTL.

### L2 details (Upstash Redis REST)

- Plain `fetch` against the Upstash REST endpoint, no client dependency.
- Key prefix `dash:`, value is the JSON entry, `SET ... PX <ttl>`.
- 1500 ms request timeout.
- Any failure (timeout, bad status, missing config) returns null and the code falls through to computing. Fail open: Redis being down never breaks a request. The first failure logs one `[cache] Redis unavailable` warning.
- When the env vars are unset, behavior is exactly the pre-Redis in-process cache. The config is checked synchronously before the async path so that without Redis, `fn()` starts before `getOrCompute` returns.

### Keys and TTLs

| Endpoint | Key | TTL |
|----------|-----|-----|
| `POST /api/dashboard/summary` | `summary:<filters JSON>` | `DASHBOARD_CACHE_TTL_MS` |
| `POST /api/dashboard/facets` | `facets:<filters JSON>` | `DASHBOARD_CACHE_TTL_MS` |
| `POST /api/dashboard/charts` | `charts:<filters JSON>` | `DASHBOARD_CACHE_TTL_MS` |
| `POST /api/centers/map` | `centers-map:<filters JSON>` | `DASHBOARD_CACHE_TTL_MS` |
| Entity queries (`lib/dashboard/entity-query-route.ts`) | `query:<entity>:<filters/page/sort JSON>` | `DASHBOARD_CACHE_TTL_MS` |
| `GET /api/search` | `search:<term>` | 24 h |
| `GET /api/accounts/autocomplete` | `autocomplete:<term>` | 24 h |

Search and autocomplete use a fixed 24 h TTL but are disabled entirely when `DASHBOARD_CACHE_TTL_MS=0` (the global off switch). All keys share the `dash:` Redis prefix, so one purge clears everything.

### Why the TTL is 8 days

Warehouse data updates once a week (Friday ETL). The recommended `DASHBOARD_CACHE_TTL_MS=691200000` (8 days = weekly cadence plus one day of slack) keeps hits warm between imports; the ETL purge, not TTL expiry, is the real invalidation. Rationale and the session that set it: [`../2026-07-29-perf-and-data-hygiene.md`](../2026-07-29-perf-and-data-hygiene.md). The code default without the env var is 10 minutes.

Latency numbers for compute vs Redis-served requests: [`redis-cache-benchmark.md`](redis-cache-benchmark.md).

## Cache invalidation

| Mechanism | Clears | When to use |
|-----------|--------|-------------|
| `POST /api/dashboard` | The route-local SWR payload cache on that instance | User-facing force refresh (the dashboard Refresh button). Does not touch the `dash:*` Redis keys |
| `x-no-cache: 1` request header | Bypasses reads on the two-tier endpoints, rewrites the entry | Debugging, benchmarks, forced repopulation of a single key |
| ETL post-import purge | All `dash:*` keys in Redis | After every production data import |
| TTL expiry | Everything, eventually | Backstop only |

### ETL purge variant (`etl/V2/main_cache_purge.py`)

Copy of `etl/V2/main.py` (same flags) that additionally runs `purge_dashboard_cache()` after a successful, non-dry-run import:

- `SCAN` cursor loop matching `dash:*` (COUNT 1000), then `DEL` each batch, via the Upstash REST API (`urllib`, 10 s timeout).
- Skipped with a notice when `UPSTASH_REDIS_REST_URL`/token (or the `KV_REST_API_*` pair) are not in the ETL `.env`.
- A purge failure never fails the import; the cache then expires by TTL.
- Warm serverless instances still hold L1 copies after the purge, but the 5-minute L1 residency cap bounds staleness: within 5 minutes every instance re-checks Redis and recomputes.

The variant also strips invisible Unicode characters (zero-width space, BOM, soft hyphen) from sheet values, a fix for the "Freudenberg SE" incident of 2026-07-29.

Use `main_cache_purge.py` for production imports (data changed, cache must drop). Use plain `main.py` for validation runs or when purging is undesirable.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPSTASH_REDIS_REST_URL` (or `KV_REST_API_URL`) | unset | Upstash REST endpoint. Unset = no L2, in-process cache only |
| `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_TOKEN`) | unset | Upstash REST bearer token. Both URL and token must be present |
| `DASHBOARD_CACHE_TTL_MS` | `600000` (10 min) in `lib/cache/memory.ts`; `3600000` (1 h) in the SWR route | Cache TTL in ms. `0` disables caching. Recommended: `691200000` (8 days) |
| `DATA_RATE_LIMIT_PER_MIN` | `60` | Per-user request budget per minute on data endpoints |
| `EXPORT_RATE_LIMIT_PER_HOUR` | `20` | Per-user export generations per rolling hour |

The `KV_REST_API_*` names are the aliases Vercel's Upstash marketplace integration injects; either pair works. Config is read per call, so serverless env changes apply without a redeploy.

## Rate limiting

### Mechanism (`lib/rate-limit/server.ts`)

Per-user, per-bucket fixed-window counters stored in Supabase Postgres, shared across all serverless instances.

- `enforceRateLimit({ userId, bucket, maxPerWindow?, windowMs? })`: computes the current window start (`floor(now / windowMs) * windowMs`), calls the `increment_rate_limit` RPC, and returns `{ ok: false, response }` with a ready 429 (JSON body plus `Retry-After` in seconds) once the counter exceeds the budget.
- Defaults: 60 requests per rolling 60 s window, budget overridable via `DATA_RATE_LIMIT_PER_MIN` or per call site.
- **Fails open**: any RPC error or thrown exception logs and returns `{ ok: true }`, so a transient DB issue never blocks legitimate traffic.

### Storage (Supabase)

Migration: [`sql/rate-limits-migration.sql`](sql/rate-limits-migration.sql).

- Table `public.rate_limit_counters` with PK `(user_id, bucket_key, window_start)`, RLS enabled, all access revoked from `anon` and `authenticated`. Only the service role touches it.
- Function `increment_rate_limit(user, bucket, window_start)`: `security definer`, empty `search_path`, executable by `service_role` only. Atomic upsert-increment returning the new count.
- Stale windows are never read once passed; an optional scheduled `DELETE` prunes rows older than a day.

### Enforced routes and buckets

| Bucket | Route | Budget |
|--------|-------|--------|
| `dashboard:get` | `GET /api/dashboard` | default (60/min) |
| `dashboard:post` | `POST /api/dashboard` (cache purge) | 10/min, tighter because it forces a full DB re-query |
| `dashboard:summary`, `dashboard:facets`, `dashboard:charts` | dashboard aggregate endpoints | default |
| `<entity>:query` | entity table queries via `lib/dashboard/entity-query-route.ts` | default |
| `centers:map`, `centers:detail`, `accounts:related`, `prospects:detail` | detail endpoints | default |
| `search`, `autocomplete` | `GET /api/search`, `GET /api/accounts/autocomplete` | default |
| `exports:list`, `exports:download` | export listing and re-download | default |
| `financials` | `GET /api/financials` | 20/min |

Export **generation** (`POST /api/exports/generate`) uses a separate mechanism: it counts the caller's `user_exports` rows over the last rolling hour and rejects past `EXPORT_RATE_LIMIT_PER_HOUR` (default 20). Also fails open on lookup errors. See [`user-exports.md`](user-exports.md).

### The financials route

`GET /api/financials` was previously callable without credentials. It now requires a Bearer token (`resolveAuthenticatedUserId`) and enforces the `financials` bucket at 20/min, tighter than the general data endpoints, because each request fans out to four upstream Yahoo Finance calls: an unauthenticated caller could burn upstream quota and get the app throttled by the provider. Missing or invalid token returns 401 before any upstream work.

## Related Files

| File | Role |
|------|------|
| `lib/cache/memory.ts` | Two-tier `getOrCompute` cache (L1 Map + Upstash L2) |
| `app/api/dashboard/route.ts` | Route-local SWR payload cache, POST purge handler |
| `lib/dashboard/entity-query-route.ts` | Shared entity-query handler (cache + rate limit) |
| `lib/rate-limit/server.ts` | `enforceRateLimit`, Supabase-backed fixed windows |
| `documentation/backend/sql/rate-limits-migration.sql` | `rate_limit_counters` table + `increment_rate_limit` RPC |
| `app/api/financials/route.ts` | Authed, rate-limited Yahoo Finance proxy |
| `app/api/exports/generate/route.ts` | Hourly export cap via `user_exports` row counts |
| `etl/V2/main_cache_purge.py` | ETL import variant with post-import `dash:*` purge |
| `tests/unit/memory-cache.test.ts`, `tests/unit/redis-cache.test.ts` | Cache behavior tests |
| `tests/unit/rate-limit.test.ts`, `tests/unit/rate-limits-migration.test.ts` | Rate limit behavior and migration tests |
| `documentation/backend/api-caching-swr.md` | SWR cache doc for `GET /api/dashboard` |
| `documentation/backend/redis-cache-benchmark.md` | Compute vs Redis latency benchmark (#249) |
| `documentation/2026-07-29-perf-and-data-hygiene.md` | Session log: 8-day TTL decision, purge-as-invalidation |
