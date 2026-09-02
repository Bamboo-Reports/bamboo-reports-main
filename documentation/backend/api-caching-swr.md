# API Caching with Stale-While-Revalidate (SWR)

> **Last Updated:** September 2026
> **Audience:** Engineering team

---

## Overview

The `/api/dashboard` route uses an **in-memory SWR (Stale-While-Revalidate) cache** to avoid redundant database queries. Since the underlying data changes only via batch imports, most requests can be served from cache with near-zero latency.

This doc covers only the route-local cache for the full `/api/dashboard` payload. The filter-state endpoints (summary, facets, charts, map, entity queries, search, autocomplete) use a separate two-tier cache (in-process + Upstash Redis), and both GET and POST here now require auth and per-user rate limiting. See [`caching-and-rate-limiting.md`](caching-and-rate-limiting.md).

---

## How It Works

```
First request     →  DB query (6 tables) → gzip → cache → respond     [MISS]
Within the TTL    →  serve cached response immediately                 [HIT]
After the TTL     →  serve stale cache → revalidate DB in background   [STALE]
Refresh button    →  POST invalidates cache → fresh DB fetch           [MISS]
```

### Cache States

| State | Meaning | Response Time |
|-------|---------|---------------|
| `MISS` | No cache exists; full DB fetch required | ~3-5s |
| `HIT` | Fresh cached data returned | ~1-5ms |
| `STALE` | Expired cache returned; background revalidation triggered | ~1-5ms |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_CACHE_TTL_MS` | `3600000` (1 hour) | Time-to-live for cached data in milliseconds |

Set in `.env.local` to customize:

```env
DASHBOARD_CACHE_TTL_MS=600000  # 10 minutes
```

---

## Response Headers

Every `/api/dashboard` GET response includes:

| Header | Values | Description |
|--------|--------|-------------|
| `X-Cache` | `HIT`, `MISS`, `STALE` | Current cache state |
| `X-Cache-Age` | Seconds (e.g., `42`) | Time since cache was last populated |

Check these in browser DevTools (Network tab) to verify caching behavior.

---

## Cache Invalidation

### Automatic (TTL-based)
After `DASHBOARD_CACHE_TTL_MS` elapses, the next request gets stale data instantly while a background revalidation refreshes the cache.

### Manual (Refresh Button)
The dashboard refresh button sends `POST /api/dashboard` which clears the cache, then fetches fresh data via GET. This ensures the user always gets the latest data when they explicitly ask for it.

### Server Restart
The cache is in-memory, so it resets on every server restart or deployment.

---

## Terminal Debug Logs

Cache operations are logged through the structured logger (`createLogger("api/dashboard")`) as events:

```
dashboard_cache_miss
dashboard_cache_populate_started / dashboard_cache_populated   (query_ms, gzip_ms, raw_mb, compressed_mb, row counts)
dashboard_cache_hit    (age_seconds, ttl_seconds, duration_ms)
dashboard_cache_stale  (age_seconds, ttl_seconds, duration_ms)
dashboard_cache_background_revalidation_started / _failed
dashboard_cache_invalidated
```

---

## Files

| File | Role |
|------|------|
| `app/api/dashboard/route.ts` | Cache logic, GET/POST handlers |
| `hooks/use-dashboard-data.ts` | Client-side `loadData(forceRefresh?)` |
| `app/page.tsx` | Refresh button calls `loadData(true)` |

---

## Architecture Notes

- **In-memory only (this route)**: the full-payload cache has no external dependencies and trades durability for simplicity. Cache is lost on cold starts, which is acceptable since the first request repopulates it. The filter-state endpoints do use a shared Redis layer, see [`caching-and-rate-limiting.md`](caching-and-rate-limiting.md).
- **Single revalidation guard**: the `revalidating` flag prevents multiple concurrent background fetches when many users hit a stale cache simultaneously.
- **Force-dynamic**: the route uses `export const dynamic = "force-dynamic"` so Next.js doesn't interfere with its own static caching. The SWR logic is fully custom.
- **Gzip stored in cache**: both raw JSON and gzipped Buffer are cached, so no re-compression is needed on cache hits.
- **Auth and rate limits**: GET requires a Bearer token and is limited per user (`dashboard:get`); POST is limited to 10/min (`dashboard:post`) since invalidation forces a full DB re-query.
