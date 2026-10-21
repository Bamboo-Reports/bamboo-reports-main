# Scripts and Tooling

> **Scope:** Standalone scripts in `scripts/` that support development but are not part of the app runtime or the ETL pipeline (see [ETL Pipeline](backend/etl-pipeline.md) for `etl/`).

---

## 1. `scripts/benchmark/data-fetch.run.ts`

Replaces the retired `scripts/benchmark-loading.mjs`, which measured the full-payload `GET /api/dashboard` route removed on 2026-09-05.

Times the Neon warehouse work behind each dashboard read endpoint (summary, facets, charts, centers map, accounts/centers/prospects page 1). It calls the same lib functions the routes use, directly, so auth, rate limiting and the response cache are not part of the numbers (the bench config sets `DASHBOARD_CACHE_TTL_MS=0`). Queries run one at a time.

Scenarios: the default filter state, `visibility=all` (the broad state), and two narrow states built from the most common HQ country and prospect department in the live data. It also reports the first-query time (a slow one means Neon compute was suspended) and a `select 1` network floor. Output is a markdown table of avg/p50/p95/min/max ms plus payload size (raw and gzipped).

Runs under Vitest (for the `@/` alias) with its own config, `vitest.bench.config.ts`, so `npm test` never picks it up.

**Run it:**

```bash
npm run bench                                   # 5 runs per query
BENCH_ITERATIONS=10 BENCH_OUT=bench.json npm run bench
```

Needs `DATABASE_URL` in `.env.local` or `.env`. Read-only.

---

## Related Files

| File | Purpose |
|------|---------|
| `scripts/benchmark/data-fetch.run.ts` | Neon warehouse fetch-time benchmark (`npm run bench`) |
| `vitest.bench.config.ts` | Vitest config used only by the benchmark |
| `documentation/backend/etl-pipeline.md` | The other standalone script category: `etl/` |
