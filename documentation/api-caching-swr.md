# API Caching with Stale-While-Revalidate (SWR)

> **Last Updated:** April 2026
> **Audience:** Engineering team

---

## Overview

The `/api/dashboard` route uses an **in-memory SWR (Stale-While-Revalidate) cache** to avoid redundant database queries. Since the underlying data changes only via batch imports, most requests can be served from cache with near-zero latency.

---

## How It Works

```
First request     →  DB query (6 tables) → gzip → cache → respond     [MISS]
Within 5 minutes  →  serve cached response immediately                 [HIT]
After 5 minutes   →  serve stale cache → revalidate DB in background   [STALE]
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
| `DASHBOARD_CACHE_TTL_MS` | `300000` (5 min) | Time-to-live for cached data in milliseconds |

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

All cache operations are logged with the `[Cache]` prefix:

```
[Cache] MISS — fetching from database
[Cache] Populated: DB 2341ms, gzip 89ms, raw 4.2MB, compressed 0.8MB
[Cache] HIT (age: 23s, TTL: 300s) — 1ms
[Cache] STALE (age: 312s, TTL: 300s) — 0ms
[Cache] Stale — revalidating in background
[Cache] Invalidated via POST
[Cache] Background revalidation failed: <error>
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

- **In-memory only** — no external dependencies (Redis, etc.). Trades durability for simplicity. Cache is lost on cold starts, which is acceptable since the first request repopulates it.
- **Single revalidation guard** — the `revalidating` flag prevents multiple concurrent background fetches when many users hit a stale cache simultaneously.
- **Force-dynamic** — the route uses `export const dynamic = "force-dynamic"` so Next.js doesn't interfere with its own static caching. The SWR logic is fully custom.
- **Gzip stored in cache** — both raw JSON and gzipped Buffer are cached, so no re-compression is needed on cache hits.
