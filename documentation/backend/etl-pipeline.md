# ETL Pipeline

> **Scope:** The Google Sheets → Postgres import process in `etl/V2/main_cache_purge.py` (with `etl/V2/main.py` as its no-purge backup): how it runs, how it diffs old vs new data, how the audit trail is populated, and how to extend it. For column-level schema, see `documentation/backend/schema-migration-guide.md`. For FK constraints and table hierarchy, see `documentation/backend/table-relationships.md`.

---

## 1. What it does, end to end

Single Python script run via `etl/V2/run.sh`. Since the 2026-07-29 cache work, `run.sh` execs `etl/V2/main_cache_purge.py`, a copy of `main.py` with two additions (invisible-character stripping and a post-import cache purge, see §1b); `main.py` is kept as the untouched no-purge backup. One invocation can do any combination of: header validation, import, indexing, schema snapshot, schema validation.

```
run.sh
  └─ main_cache_purge.py (main.py = same minus the last step and the invisible-char strip)
       ├─ check_sheet_headers()      Diff each worksheet's header row vs master-schema.json
       ├─ run_import()               Pull sheets → clean → diff vs DB → replace tables → log changes
       ├─ apply_constraints()        Re-apply PKs/FKs (CONSTRAINTS_SQL)
       ├─ apply_indexes()            Re-apply per-table indexes (TABLE_DEFS[*]["indexes"])
       ├─ run_snapshot()             Dump DB column/row/size stats to a JSON file on disk
       ├─ run_validate()             Compare DB column types vs master-schema.json
       └─ purge_dashboard_cache()    Delete the app's dash:* Redis keys (cache-purge variant only)
```

**Input source.** A single Google Sheet (`SPREADSHEET_ID`), one worksheet per table. The worksheet-name-to-table-name mapping is `WORKSHEET_MAP`, derived from `TABLE_DEFS[*]["worksheet"]` (currently 1:1: `accounts`, `alias`, `ticker`, `centers`, `services`, `functions`, `tech`, `prospects`). Sheets are read with `gspread` + `gspread_dataframe.get_as_dataframe(evaluate_formulas=True, header=0)`, then fully-blank rows and `Unnamed:*` columns are dropped.

**Cleaning.** `clean_dataframe` coerces each column to its `master-schema.json` type. In the cache-purge variant, every value is additionally stripped of invisible characters (`INVISIBLE_CHARS_RE`: zero-width space U+200B, zero-width non-joiner U+200C, zero-width joiner U+200D, BOM U+FEFF, soft hyphen U+00AD) before numeric parsing in `clean_dataframe` and in `normalize_change_value` / `normalize_text_value`. These are paste artifacts that render as nothing in Google Sheets but corrupt keys, sorting, and search in the warehouse (the "Freudenberg SE" incident, see `documentation/2026-07-29-perf-and-data-hygiene.md`); commit `e526d53`.

**DB connection.** `sqlalchemy.create_engine(CONN_STRING, pool_pre_ping=True)` where `CONN_STRING = NEON_DSN or DATABASE_URL`. All DDL/DML connections set `isolation_level="AUTOCOMMIT"`, so each statement (or each `to_sql` batch) commits independently, there is no wrapping transaction across a table's import.

**Table creation.** Each table is fully replaced on every import: `DROP TABLE IF EXISTS {table} CASCADE` followed by `df_clean.to_sql(table, engine, if_exists="replace", index=False, method="multi", chunksize=1000, dtype=dtypes)`. Column types come from `master-schema.json` via `TYPE_MAPPING`. `CASCADE` on the drop is what lets an `accounts` reload nuke and let dependent FKs be silently dropped too; they're always reapplied afterward via `apply_constraints()`.

**Diffing old vs new.** Before dropping/replacing a table, `main.py` fetches a pre-import snapshot of that table from Postgres (`fetch_existing_table_snapshot`) restricted to identity columns, label columns, and tracked fields. After cleaning the new sheet data, it builds a normalized "identity index" per row (`prepare_table_identity_index`) and diffs old vs new on that index to produce field-change and lifecycle events (see §2).

References to `main.py` internals below (function names, `TABLE_DEFS`, `CONSTRAINTS_SQL`, etc.) apply identically to `main_cache_purge.py`; the two files are kept in sync apart from the differences in §1b.

## 1b. The cache-purge variant (`main_cache_purge.py`)

`main_cache_purge.py` is what `run.sh` actually runs. It differs from `main.py` in exactly two ways:

1. **Invisible-character stripping** during cleaning and normalization (see §1 above).
2. **`purge_dashboard_cache()`** after a successful non-dry-run import: the web app caches dashboard responses in a shared Upstash Redis under `dash:*` keys with a long TTL (`DASHBOARD_CACHE_TTL_MS`, 8 days, aligned to the weekly Friday import). The purge SCANs and DELs all `dash:*` keys via the Upstash REST API (stdlib `urllib`, no new dependency) so the app serves fresh data minutes after an import instead of waiting out the TTL. It is skipped with a dim notice when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are unset, and a purge failure logs a warning without failing the import. On the app side, `lib/cache/memory.ts` caps L1 (in-process) cache residency at 5 minutes when Redis is configured, so the purge reaches warm serverless instances quickly.

`main.py` is the deliberate no-purge backup (two-script policy): run it directly with `uv run --project etl/V2 --locked python etl/V2/main.py` if you need an import without touching the app cache. Flags and env vars are identical. Context: `documentation/2026-07-29-perf-and-data-hygiene.md`, `documentation/security-249-progress.md`.

---

## 2. Audit trail (`audit.*`)

### Tables (created/migrated by `ensure_notification_tables`)

| Table | Populated by | Purpose |
|---|---|---|
| `audit.import_runs` | `create_import_run` / `finalize_import_run` | One row per `run_import()` invocation: status, tables targeted, counts, error message |
| `audit.field_change_events` | `insert_change_events` | One row per changed field, or per row added/removed, on a tracked table |
| `audit.notification_reads` | (dashboard app, not the ETL) | Per-user read receipts on change events |
| `audit.user_notification_state` | (dashboard app, plus a one-time backfill in `ensure_notification_tables`) | Per-user last-read bookmark |

`ensure_notification_tables` also handles legacy migration: if `public.import_runs` / `public.field_change_events` / `public.notification_reads` exist but their `audit.*` counterparts don't, it moves them into the `audit` schema (`ALTER TABLE ... SET SCHEMA audit`), then patches columns that may be missing on older rows (`table_name`, `record_uuid`, `record_identity`, `record_label`), and drops legacy columns (`account_uuid`, `account_global_legal_name`) from `field_change_events`.

### What counts as a "change"

Only tables with `track_changes: True` in `TABLE_DEFS` produce field-change events: `accounts`, `alias`, `ticker`, `centers`, `services`, `prospects`. `functions` and `tech` are excluded (`track_changes: False`).

- **Tracked fields** (`get_tracked_table_fields`): every schema column for that table except `uuid` and the table's `primary_id` columns.
- **Identity for diffing** (`prepare_table_identity_index`): built from `primary_id` columns if present and non-null for a row, else falls back to `secondary_id` columns. Values are normalized (`normalize_change_value`) and concatenated as `col=value|col=value`, prefixed `key:` (primary) or `fallback:` (secondary). Duplicate identities within one side keep the first row and log a warning.
- **Field-change event** (`compute_table_field_changes`): for rows whose identity exists in both old and new snapshots, every tracked field is compared post-normalization; a mismatch emits one row into `field_change_events` with `field_name`, `old_value`, `new_value`, plus `record_uuid` and `record_label` (resolved via `resolve_table_row_label`, which tries the table's `label_cols` in order, then falls back to `account_global_legal_name`).
- **Lifecycle events** (`compute_table_lifecycle_events`, only for `track_lifecycle: True` tables, i.e. all of the above six): an identity present only in the new snapshot emits `field_name = "__row_added__"`; present only in the old snapshot emits `field_name = "__row_removed__"`.
- **Lifecycle tracking is suppressed on the very first import**: `has_completed_import_baseline` checks whether any `audit.import_runs` row has `status = 'completed'`; if not, every row in this run would otherwise look "added," so lifecycle events are skipped for that run only. Field-change events still run normally (they no-op anyway with an empty old snapshot).

### Retention

`cleanup_old_change_events` deletes rows from `field_change_events` older than `RETENTION_DAYS = 90`, run once at the end of a successful (non-dry-run) import.

---

## 3. Running it locally

```bash
etl/V2/run.sh                  # default: import -> snapshot -> validate -> index
etl/V2/run.sh --import         # import -> snapshot
etl/V2/run.sh --dry-run        # full import pipeline, diffing included, no DB writes
etl/V2/run.sh --validate       # schema validation only
etl/V2/run.sh --schema         # snapshot only
etl/V2/run.sh --index          # (re)apply indexes only
etl/V2/run.sh --check-headers  # diff sheet headers vs master-schema.json, no DB connection changes
etl/V2/run.sh --table centers  # restrict any of the above to one table
etl/V2/run.sh --verbose        # debug-level logging
```

`run.sh` requires `uv` on `PATH` and executes `uv run --project etl/V2 --locked python etl/V2/main_cache_purge.py "$@"`. `--locked` means it will fail if `pyproject.toml` and the lockfile are out of sync; don't hand-edit dependencies without re-locking. To run the no-purge backup, invoke `main.py` with the same `uv run` command directly (see §1b).

### Env vars (loaded from `etl/V2/.env` or repo-root `.env`, whichever is found first)

| Var | Required | Used for |
|---|---|---|
| `NEON_DSN` or `DATABASE_URL` | Yes (one of them) | Postgres connection string |
| `SPREADSHEET_ID` | Yes | Google Sheet to read from |
| `GOOGLE_SA_FILE` | Yes | Path (absolute, or relative to `etl/V2/` or repo root) to a Google service-account JSON key with `spreadsheets.readonly` scope |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | No | Post-import cache purge (`main_cache_purge.py` only); purge is skipped when unset |

Missing `NEON_DSN`/`DATABASE_URL` or `SPREADSHEET_ID` aborts immediately at import time (module-level check). Missing/invalid `GOOGLE_SA_FILE` raises when a Sheets client is actually needed (import or `--check-headers`), not at startup.

### Dependencies

`etl/V2/pyproject.toml`: `google-auth`, `gspread`, `gspread-dataframe`, `pandas`, `psycopg2-binary`, `python-dotenv`, `rich`, `sqlalchemy`. Python `>=3.11`. `[tool.uv] package = false`: it's a script project, not an installable package.

---

## 4. Idempotency / re-run behavior

- **Re-running with no sheet changes**: tables are dropped and reloaded identically. No field-change events are inserted (`old_norm_val != new_norm_val` is false for every field), no lifecycle events (identity sets match). `audit.import_runs` still gets a new row (`status = 'completed'`, `change_events_logged = 0`).
- **Not an upsert**: there's no row-level UPSERT/`ON CONFLICT`. Import is destructive-replace per table (`DROP ... CASCADE` + full `to_sql`). The "diff" is purely for the audit trail (what changed); it doesn't drive which rows get written.
- **Partial `--table` reruns**: importing a single child table (e.g. `--table services`) still runs `DROP TABLE IF EXISTS services CASCADE`, so its own FK-dependent rows (none, in this case, since nothing points at `services`) would cascade; more importantly, `apply_constraints()` runs the *entire* `CONSTRAINTS_SQL` list after any successful import (not just constraints for the tables touched), so re-running one table still needs its parent tables to already exist in the DB.
- **Concurrent table imports**: tables in `IMPORT_ORDER` are downloaded/cleaned/diffed/written concurrently via a `ThreadPoolExecutor` (`max_workers=min(32, len(tables))`), not sequentially. Order matters for satisfying FK *constraints* (applied afterward, once, in `CONSTRAINTS_SQL`'s fixed sequence), not for the writes themselves. `IMPORT_ORDER` is used to select and filter which tables run, but each table's `DROP`+`to_sql` happens independently in its own worker thread.

---

## 5. Error handling / rollback

- No cross-table transaction. Every SQL connection is `AUTOCOMMIT`. If table 5 of 8 fails mid-`run_import`, tables 1-4 are already dropped-and-replaced in Postgres; there is no automatic rollback of already-committed table writes.
- `run_import` wraps the whole per-table loop in `try/except`. On any exception: logs it (`logger.exception`), and if an `import_run_id` exists and it's not a dry run, calls `finalize_import_run(..., status="failed", ..., error_message=str(e)[:1000])`, then re-raises. So a failed run is always recorded in `audit.import_runs` with `status = 'failed'` before the process exits non-zero.
- Header validation is a pre-flight gate: `run_import` mode always calls `check_sheet_headers()` first (even in `--dry-run`) and aborts before touching the DB if any target worksheet is missing schema columns (duplicates or missing columns are `FAIL`; extra sheet columns are only a `WARN`).
- `--dry-run` runs the full download/clean/diff pipeline and prints the same summary table (including projected `Field Changes`/`Added`/`Removed` counts) but skips `ensure_notification_tables`, `create_import_run`, the `DROP`+`to_sql` write, `insert_change_events`, `apply_constraints`, `apply_indexes`, and `run_snapshot`. Nothing hits the DB except the initial connectivity check and (if not `--check-headers` alone) the header read.
- `main()` also catches `KeyboardInterrupt` (exit 130) and any other top-level exception (exit 1) around the whole `main()` call.

---

## 6. Extending the pipeline

### Add a new column to an existing table

1. Add the column to the corresponding sheet in the source spreadsheet with a matching header.
2. Add the column definition (`Column`, `Type`) to that table's entry in `etl/V2/master-schema.json`. Type must be one of the keys in `TYPE_MAPPING` (`INTEGER`, `BIGINT`, `TEXT`, `VARCHAR`, `TIMESTAMP`, `BOOLEAN`, `DOUBLE PRECISION`, `FLOAT`).
3. If the column should show up in `documentation/backend/schema-migration-guide.md`, add it there too (not read by the ETL, documentation only).
4. Nothing else to change in the scripts: `clean_dataframe` reads `schema_cols` from the schema file dynamically, and `get_tracked_table_fields` will automatically include the new column in change tracking (unless it's `uuid` or a primary-id column, or the table has `track_changes: False`).
5. Run `etl/V2/run.sh --check-headers --table <table>` to confirm the sheet header matches before doing a real import.

### Add a new sheet/table entirely

1. Add a worksheet to the spreadsheet, and its full column list + types to `master-schema.json` (new top-level key).
2. Add an entry to `TABLE_DEFS` in **both** `main_cache_purge.py` and `main.py` (they must stay in sync, see §1b) with:
   - `worksheet`: the exact worksheet name.
   - `primary_id` / `secondary_id`: columns used to build the diff identity (`prepare_table_identity_index`). Leave both `[]` if the table has no stable identity for diffing (like `functions`, `tech`).
   - `label_cols`: columns used for `record_label` in change events (human-readable identifier shown in notifications).
   - `track_changes` / `track_lifecycle`: `True` to log field-change/added/removed events for this table.
   - `indexes`: list of `CREATE INDEX IF NOT EXISTS ...` statements.
3. Add the table name to `IMPORT_ORDER`, positioned after any table it has an FK to.
4. If it references another table, add the FK to `CONSTRAINTS_SQL` (and a PK line if it needs one), following the pattern of existing entries. Update `documentation/backend/table-relationships.md` with the new relationship.
5. `TABLE_PRIMARY_ID_COLUMNS`, `TABLE_SECONDARY_ID_COLUMNS`, `TABLE_LABEL_COLUMNS`, `TRACKED_EVENT_TABLES`, `LIFECYCLE_EVENT_TABLES`, `WORKSHEET_MAP` are all derived automatically from `TABLE_DEFS`, no separate edits needed.
6. Run `--check-headers`, then `--dry-run --table <new_table>` to sanity-check before a real import.

---

## 7. Sheet validator (`etl/data_validator/`)

Standalone pre-import validation of the source spreadsheet, copied from the `br-data-scripts` repo in commit `6666b40` so all pipeline scripts live together. Run it before an import to catch data problems the ETL itself does not check (formats, duplicates, broken references). It reads the sheet only; it never touches the DB.

**Running.** `validate.py` is a PEP 723 script (deps declared inline, installed automatically by `uv`):

```bash
cd etl/data_validator && uv run validate.py            # all phases
cd etl/data_validator && uv run validate.py --force    # continue past a failing phase
```

Config comes from `etl/data_validator/.env` (`SPREADSHEET_ID`, `GOOGLE_SA_FILE`; the latter is resolved relative to that directory and points at `etl/V2`'s existing service-account key rather than a duplicate, see `.env.example`).

**Phases** (each failing phase stops the run unless `--force`):

| Phase | Check |
|---|---|
| 0 | Per-column format/enum/nullable rules (`ALL_RULES`) for all eight tables |
| 0B | Invisible characters: flags cells containing zero-width chars, BOM, or soft hyphen, with exact sheet/row/column |
| 1 | Uniqueness of key columns: `accounts.account_global_legal_name`, `centers.cn_unique_key`, `services.cn_unique_key`, `prospects.ps_unique_key` |
| 2 / 2B | Referential integrity (`account_global_legal_name` in child sheets, `center_name` in services, `cn_unique_key` in services/functions/tech) plus completeness (every accounts row present in alias and ticker) |
| 3 | Every services row has at least one service column filled |

`clean_sm_leading_dashes.py` is a one-off cleaner that removes leading `- ` markers from lines in given columns of the SM sheet (dry run by default; `--apply` writes). `requirements.txt` mirrors the dependencies for non-uv use.

---

## Related Files

| File | Purpose |
|---|---|
| `etl/V2/main_cache_purge.py` | Primary entry (via `run.sh`): full ETL logic plus invisible-char stripping and post-import cache purge |
| `etl/V2/main.py` | No-purge backup of the same ETL logic, kept in sync (§1b) |
| `etl/V2/master-schema.json` | Per-table column/type definitions, read by `clean_dataframe`, `apply_indexes`'s validation, and `run_validate` |
| `etl/V2/pyproject.toml` | Python dependencies and `uv` project config |
| `etl/V2/run.sh` | Entry point, wraps `uv run` around `main_cache_purge.py` |
| `etl/data_validator/validate.py` | Pre-import sheet validation (§7) |
| `etl/data_validator/clean_sm_leading_dashes.py` | One-off SM-sheet cleanup script |
| `etl/V2/import_logs/logs/` | Per-run text log files (`setup_logger`) |
| `etl/V2/import_logs/snapshot/` | Per-run JSON DB snapshots (`run_snapshot`) |
| `documentation/backend/table-relationships.md` | FK constraints, import order, table hierarchy |
| `documentation/backend/schema-migration-guide.md` | Column-level schema reference |
| `documentation/2026-07-29-perf-and-data-hygiene.md` | Cache-cadence and invisible-character incident write-up |
| `documentation/security-249-progress.md` | Redis cache layer and ETL purge integration notes |
