# Scripts and Tooling

> **Scope:** Standalone scripts in `scripts/` that support development but are not part of the app runtime or the ETL pipeline (see [ETL Pipeline](backend/etl-pipeline.md) for `etl/V2/`).

---

## 1. `scripts/benchmark-loading.mjs`

Compares raw database query time against the `/api/dashboard` route's cached, gzip'd response, to measure how much the SWR cache and compression layer actually save. See [API Caching (SWR)](backend/api-caching-swr.md) for what that layer does.

**What it measures, in two parts:**

1. **Direct DB queries**: runs the six warehouse table queries (`accounts`, `centers`, `functions`, `services`, `tech`, `prospects`) directly against Neon via `@neondatabase/serverless`, three iterations, reporting per-table timing, row counts, and raw JSON payload size. Also gzip-simulates the combined payload to show the theoretical compression ceiling.
2. **API route**: fetches `GET /api/dashboard` three times, reporting wall-clock time, transfer size, and the `Content-Encoding` header actually returned.

It then prints a side-by-side comparison table (query time, raw payload, transfer size, gzip estimate).

**Run it:**

```bash
node --env-file=.env scripts/benchmark-loading.mjs
```

Requires `DATABASE_URL` in the environment (the script exits immediately if it's missing). For the API-route half to reflect gzip compression, the app must be running a **production** build (`npm run build && npm run start`); `next dev` does not compress responses, and the script detects and warns about this (`Content-Encoding: none`).

`API_URL` env var overrides the target (`http://localhost:3000` by default) if benchmarking a deployed environment.

## 2. `scripts/generate_work_summary.py`

Generates an `.xlsx` report (`reports/may-june-work-summary.xlsx`) summarizing recent git activity for stakeholder reporting. Parses `git log --numstat` over a configured date range, classifies each commit by conventional-commit prefix (`feat:`, `fix:`, `docs:`, etc.) into `Feature` / `Fix` / `Other`, and infers a functional area (Analytics, Exports, Notifications, Database, Testing, Documentation, Search/Filters, ...) from the changed file paths and commit subject keywords.

Output is a formatted Excel workbook (via `openpyxl`) with one row per commit: date, author, subject, files/insertions/deletions, area, and category.

**Editing the date range or area rules:** `DATE_START` / `DATE_END` and the `infer_area()` keyword table are hardcoded constants at the top of the file. There's no CLI flag; edit the constants directly for a different reporting period or to add a new area bucket.

**Run it:**

```bash
python3 scripts/generate_work_summary.py
```

Requires `openpyxl` (not a project-wide npm/Python dependency; install it in your local environment before running: `pip install openpyxl`).

---

## Related Files

| File | Purpose |
|------|---------|
| `scripts/benchmark-loading.mjs` | DB-vs-API-route load time and payload size comparison |
| `scripts/generate_work_summary.py` | Git-history-driven `.xlsx` work summary generator |
| `documentation/backend/api-caching-swr.md` | What the `/api/dashboard` cache layer the benchmark measures actually does |
| `documentation/backend/etl-pipeline.md` | The other standalone script category: `etl/V2/` |
