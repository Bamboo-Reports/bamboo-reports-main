# Scripts and Tooling

> **Scope:** Standalone scripts in `scripts/` that support development but are not part of the app runtime or the ETL pipeline (see [ETL Pipeline](backend/etl-pipeline.md) for `etl/V2/`).

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

---

## Related Files

| File | Purpose |
|------|---------|
| `scripts/generate_work_summary.py` | Git-history-driven `.xlsx` work summary generator |
| `documentation/backend/etl-pipeline.md` | The other standalone script category: `etl/V2/` |
