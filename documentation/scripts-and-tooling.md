# Scripts and Tooling

> **Scope:** Standalone scripts in `scripts/` that support development but are not part of the app runtime or the ETL pipeline (see [ETL Pipeline](backend/etl-pipeline.md) for `etl/`).

---

## 1. `scripts/benchmark-loading.mjs` (retired)

Measured the retired `GET /api/dashboard` full-payload route against raw warehouse queries. Removed on 2026-09-05 with that route. Latency figures for the current endpoints: [`backend/redis-cache-benchmark.md`](backend/redis-cache-benchmark.md).

## 2. `scripts/generate_work_summary.py`

Generates an `.xlsx` report (`reports/may-june-work-summary.xlsx`) summarizing recent git activity for stakeholder reporting. Parses `git log --numstat` over a configured date range, classifies each commit by conventional-commit prefix (`feat:`, `fix:`, `docs:`, etc.) into `Feature` / `Fix` / `Other`, and infers a functional area (Analytics, Exports, Notifications, Database, Testing, Documentation, Search/Filters, ...) from the changed file paths and commit subject keywords.

Output is a formatted Excel workbook (via `openpyxl`) with one row per commit: date, author, subject, files/insertions/deletions, area, and category.

**Editing the date range or area rules:** `DATE_START` / `DATE_END` and the `infer_area()` keyword table are hardcoded constants at the top of the file. There's no CLI flag; edit the constants directly for a different reporting period or to add a new area bucket.

**Run it:**

```bash
python3 scripts/generate_work_summary.py
```

Requires `openpyxl` (not a project-wide npm/Python dependency; install it in your local environment before running: `pip install openpyxl`).

## 3. `scripts/benchmark/data-fetch.run.ts`

Times the Neon warehouse work behind each dashboard read endpoint (summary, facets, charts, centers map, accounts/centers/prospects page 1). It calls the same lib functions the routes use, directly, so auth, rate limiting and the response cache are not part of the numbers (the bench config sets `DASHBOARD_CACHE_TTL_MS=0`). Queries run one at a time.

Scenarios: the default filter state, `visibility=all` (the broad state), and two narrow states built from the most common HQ country and prospect department in the live data. It also reports the first-query time (a slow one means Neon compute was suspended) and a `select 1` network floor. Output is a markdown table of avg/p50/p95/min/max ms plus payload size (raw and gzipped).

Runs under Vitest (for the `@/` alias) with its own config, `vitest.bench.config.ts`, so `npm test` never picks it up.

**Run it:**

```bash
npm run bench                                   # 5 runs per query
BENCH_ITERATIONS=10 BENCH_OUT=bench.json npm run bench
```

Needs `DATABASE_URL` in `.env`. Read-only.

---

## Related Files

| File | Purpose |
|------|---------|
| `scripts/generate_work_summary.py` | Git-history-driven `.xlsx` work summary generator |
| `scripts/benchmark/data-fetch.run.ts` | Neon warehouse fetch-time benchmark (`npm run bench`) |
| `vitest.bench.config.ts` | Vitest config used only by the benchmark |
| `documentation/backend/etl-pipeline.md` | The other standalone script category: `etl/` |
