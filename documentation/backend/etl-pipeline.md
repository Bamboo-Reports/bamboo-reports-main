# ETL Pipeline

> **Scope:** The ETL in `etl/`: the Google Sheets → Postgres importer (`etl/importer/`) and the sheet tools that run before it (`etl/sheets/`, §7): how they run, how the import diffs old vs new data, how the audit trail is populated, and how to extend it. For column-level schema, see `documentation/backend/schema-migration-guide.md`. For FK constraints and table hierarchy, see `documentation/backend/table-relationships.md`.

---

## 1. What it does, end to end

The ETL is one uv project in `etl/` (one `pyproject.toml`, one `uv.lock`, one `.env`) with three packages:

```
etl/
  common/      env.py (loads etl/.env), google.py (service account, gspread client, rate-limit retry), tui.py (terminal look)
  importer/    the Sheets → Postgres import, run as `python -m importer`
    cli.py         flags, stage plan, header, summary
    config.py      DATABASE_URLS (dev/prod), paths, audit table names
    tables.py      TABLE_DEFS, IMPORT_ORDER, CONSTRAINTS_SQL, TYPE_MAPPING, master-schema.json loader
    headers.py     check_sheet_headers()
    cleaning.py    clean_dataframe(), value normalisation for diffing
    changes.py     audit tables, import runs, field and lifecycle change events
    load.py        run_import()
    database.py    engine, constraints, indexes, ANALYZE, snapshot, schema check
    cache.py       purge_dashboard_cache()
    logs.py        log file, console log handler, closing-summary stages
    master-schema.json
  sheets/      validate and cleanup for the source sheet (§7), sharing rules.py
```

One invocation of the importer can do any combination of: header validation, import, indexing, schema snapshot, schema validation.

```
python -m importer (cli.main)
  ├─ check_sheet_headers()      Diff each worksheet's header row vs master-schema.json
  ├─ run_import()               Pull sheets → clean → diff vs DB → replace tables → log changes
  ├─ apply_constraints()        Re-apply PKs/FKs (CONSTRAINTS_SQL)
  ├─ apply_indexes()            Re-apply per-table indexes (TABLE_DEFS[*]["indexes"])
  ├─ analyze_tables()           ANALYZE each reloaded table so the planner has statistics before the purge
  ├─ run_snapshot()             Dump DB column/row/size stats to a JSON file on disk
  ├─ run_validate()             Compare DB column types vs master-schema.json
  └─ purge_dashboard_cache()    Delete the app's dash:* Redis keys (prod imports only, see §1b)
```

**Input source.** A single Google Sheet (`SPREADSHEET_ID`), one worksheet per table. The worksheet-name-to-table-name mapping is `WORKSHEET_MAP`, derived from `TABLE_DEFS[*]["worksheet"]` (currently 1:1: `accounts`, `alias`, `ticker`, `centers`, `services`, `functions`, `tech`, `prospects`, `subscribers`). Sheets are read with `gspread` + `gspread_dataframe.get_as_dataframe(evaluate_formulas=True, header=0)`, then fully-blank rows and `Unnamed:*` columns are dropped.

**Cleaning.** `clean_dataframe` coerces each column to its `master-schema.json` type. Every value is also stripped of invisible characters (`INVISIBLE_CHARS_RE`: zero-width space U+200B, zero-width non-joiner U+200C, zero-width joiner U+200D, BOM U+FEFF, soft hyphen U+00AD) before numeric parsing in `clean_dataframe` and in `normalize_change_value` / `normalize_text_value`. These are paste artifacts that render as nothing in Google Sheets but corrupt keys, sorting, and search in the warehouse (the "Freudenberg SE" incident, see `documentation/2026-07-29-perf-and-data-hygiene.md`); commit `e526d53`.

**DB connection.** `sqlalchemy.create_engine(CONN_STRING, pool_pre_ping=True)` where the URL is `DATABASE_URL_DEV` or `DATABASE_URL_PROD`, chosen by `--target dev|prod` (default `dev`, so prod is only written when named) at the start of `cli.main()`. All DDL/DML connections set `isolation_level="AUTOCOMMIT"`, so each statement (or each `to_sql` batch) commits independently, there is no wrapping transaction across a table's import.

**Table creation.** Each table is fully replaced on every import: `DROP TABLE IF EXISTS {table} CASCADE` followed by `df_clean.to_sql(table, engine, if_exists="replace", index=False, method="multi", chunksize=1000, dtype=dtypes)`. Column types come from `master-schema.json` via `TYPE_MAPPING`. `CASCADE` on the drop is what lets an `accounts` reload nuke and let dependent FKs be silently dropped too; they're always reapplied afterward via `apply_constraints()`.

**Diffing old vs new.** Before dropping/replacing a table, the importer fetches a pre-import snapshot of that table from Postgres (`fetch_existing_table_snapshot`) restricted to identity columns, label columns, and tracked fields. After cleaning the new sheet data, it builds a normalized "identity index" per row (`prepare_table_identity_index`) and diffs old vs new on that index to produce field-change and lifecycle events (see §2).


## 1b. Dashboard cache purge

The web app caches dashboard responses in a shared Upstash Redis under `dash:*` keys with a long TTL (`DASHBOARD_CACHE_TTL_MS`, 8 days, aligned to the weekly Friday import). After a successful non-dry-run `--target prod` import, `purge_dashboard_cache()` (`importer/cache.py`) SCANs and DELs all `dash:*` keys via the Upstash REST API (stdlib `urllib`, no new dependency) so the app serves fresh data minutes after an import instead of waiting out the TTL. `analyze_tables()` runs first so the recomputes that follow have planner statistics.

- Dev imports skip the purge, since the shared cache serves prod; `--no-purge` skips it on a prod import too.
- It is skipped with a notice when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are unset, and a purge failure logs a warning without failing the import.
- On the app side, `lib/cache/memory.ts` caps L1 (in-process) cache residency at 5 minutes when Redis is configured, so the purge reaches warm serverless instances quickly.

Until 2026-10-21 this lived in a second copy of the script (`etl/V2/main_cache_purge.py`, with `main.py` as the no-purge backup); the two were merged into the importer package, and `--no-purge` replaces the backup. Context: `documentation/2026-07-29-perf-and-data-hygiene.md`, `documentation/security-249-progress.md`.

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

Only tables with `track_changes: True` in `TABLE_DEFS` produce field-change events: `accounts`, `alias`, `ticker`, `centers`, `services`, `prospects`. `functions`, `tech` and `subscribers` are excluded (`track_changes: False`).

- **Tracked fields** (`get_tracked_table_fields`): every schema column for that table except `uuid` and the table's `primary_id` columns.
- **Identity for diffing** (`prepare_table_identity_index`): built from `primary_id` columns if present and non-null for a row, else falls back to `secondary_id` columns. Values are normalized (`normalize_change_value`) and concatenated as `col=value|col=value`, prefixed `key:` (primary) or `fallback:` (secondary). Duplicate identities within one side keep the first row and log a warning.
- **Field-change event** (`compute_table_field_changes`): for rows whose identity exists in both old and new snapshots, every tracked field is compared post-normalization; a mismatch emits one row into `field_change_events` with `field_name`, `old_value`, `new_value`, plus `record_uuid` and `record_label` (resolved via `resolve_table_row_label`, which tries the table's `label_cols` in order, then falls back to `account_global_legal_name`).
- **Lifecycle events** (`compute_table_lifecycle_events`, only for `track_lifecycle: True` tables, i.e. all of the above six): an identity present only in the new snapshot emits `field_name = "__row_added__"`; present only in the old snapshot emits `field_name = "__row_removed__"`.
- **Lifecycle tracking is suppressed on the very first import**: `has_completed_import_baseline` checks whether any `audit.import_runs` row has `status = 'completed'`; if not, every row in this run would otherwise look "added," so lifecycle events are skipped for that run only. Field-change events still run normally (they no-op anyway with an empty old snapshot).

### Retention

`cleanup_old_change_events` deletes rows from `field_change_events` older than `RETENTION_DAYS = 90`, run once at the end of a successful (non-dry-run) import.

---

## 3. Running it locally

`etl/import.sh` is the everyday entry point. It takes the importer's flags (`etl/import.sh --help` lists them), works from any directory, and asks for confirmation before anything writes to prod (`--yes` skips the question and is required without a terminal):

```bash
etl/import.sh --dry-run                  # preview a dev import
etl/import.sh                            # full import into dev
etl/import.sh --target prod              # weekly prod import (asks to confirm)
```

Under the hood it runs the importer with uv; the same flags work directly, from the repo root with `uv run --directory etl` (or from `etl/` with plain `uv run`):

```bash
uv run --directory etl python -m importer                  # default: import -> snapshot -> validate -> index, into dev
uv run --directory etl python -m importer --target prod    # the same into prod, then purge the dashboard cache
uv run --directory etl python -m importer --import         # import -> snapshot
uv run --directory etl python -m importer --dry-run        # full import pipeline, diffing included, no DB writes
uv run --directory etl python -m importer --validate       # schema validation only
uv run --directory etl python -m importer --schema         # snapshot only
uv run --directory etl python -m importer --index          # (re)apply indexes only
uv run --directory etl python -m importer --check-headers  # diff sheet headers vs master-schema.json, no DB connection changes
uv run --directory etl python -m importer --table centers  # restrict any of the above to one table
uv run --directory etl python -m importer --no-purge       # prod import without the cache purge
uv run --directory etl python -m importer --verbose        # debug-level logging
```

Every run opens with a header (target, database host, tables, whether it writes, the stages it will run, the log file), shows one compact table per stage (headers, per-table import results, snapshot, schema check) with progress bars while it works, and ends with a summary of every stage and a verdict panel. Routine progress messages go only to the log file; `--verbose` shows them on screen too. The look is shared with the sheet tools through `etl/common/tui.py`.

`uv` installs the dependencies from `etl/uv.lock` on first run. Add or remove dependencies with `uv add` / `uv remove` in `etl/` so the lockfile stays in sync.

### Env vars (one file for every ETL tool: `etl/.env`, see `etl/.env.example`)

| Var | Required | Used for |
|---|---|---|
| `DATABASE_URL_DEV` / `DATABASE_URL_PROD` | The one for the chosen `--target` | Postgres connection string for the dev or prod database |
| `SPREADSHEET_ID` | Yes | Google Sheet to read from |
| `GOOGLE_SA_FILE` | Yes | Path (absolute, or relative to `etl/`) to a Google service-account JSON key. The importer and validate use the `spreadsheets.readonly` scope; cleanup and `validate --highlight` need write access |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | No | Post-import cache purge on prod imports; skipped when unset |

A missing `SPREADSHEET_ID` or URL for the chosen `--target` aborts as soon as the arguments are parsed. A missing or invalid `GOOGLE_SA_FILE` raises when a Sheets client is actually needed (import or `--check-headers`), not at startup.

### Dependencies

`etl/pyproject.toml`: `google-auth`, `gspread`, `gspread-dataframe`, `pandas`, `psycopg2-binary`, `python-dotenv`, `rich`, `sqlalchemy`, plus `ruff` in the `dev` group (`uv run ruff check .` from `etl/`). Python `>=3.11`. `[tool.uv] package = false`: the packages run in place with `python -m`, nothing is installed.

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
2. Add the column definition (`Column`, `Type`) to that table's entry in `etl/importer/master-schema.json`. Type must be one of the keys in `TYPE_MAPPING` (`INTEGER`, `BIGINT`, `TEXT`, `VARCHAR`, `TIMESTAMP`, `BOOLEAN`, `DOUBLE PRECISION`, `FLOAT`).
3. If the column should show up in `documentation/backend/schema-migration-guide.md`, add it there too (not read by the ETL, documentation only).
4. Nothing else to change in the scripts: `clean_dataframe` reads `schema_cols` from the schema file dynamically, and `get_tracked_table_fields` will automatically include the new column in change tracking (unless it's `uuid` or a primary-id column, or the table has `track_changes: False`).
5. Run `uv run --directory etl python -m importer --check-headers --table <table>` to confirm the sheet header matches before doing a real import.

### Add a new sheet/table entirely

1. Add a worksheet to the spreadsheet, and its full column list + types to `master-schema.json` (new top-level key).
2. Add an entry to `TABLE_DEFS` in `etl/importer/tables.py` with:
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

## 7. Sheet tools (`etl/sheets/`)

Standalone pre-import validation of the source spreadsheet, copied from the `br-data-scripts` repo in commit `6666b40` so all pipeline scripts live together. Run it before an import to catch data problems the ETL itself does not check (formats, duplicates, broken references). It reads the sheet only; it never touches the DB.

**Running.** Both tools are packages in the same uv project as the importer. `etl/validate.sh` wraps validate with a `--help` and rejects unknown flags (validate itself ignores them):

```bash
etl/validate.sh --force --limit 50                             # same as the commands below
uv run --directory etl python -m sheets.validate               # all phases
uv run --directory etl python -m sheets.validate --force       # continue past a failing phase
uv run --directory etl python -m sheets.validate --limit 50    # more rows per detail table (default 20)
uv run --directory etl python -m sheets.validate --highlight   # colour failing rows and cells in the sheet
```

`sheets/validate/` is split by phase: `sheet_cache.py` (every sheet read once), `table_format.py` (Phase 0 per sheet), `cell_checks.py` (0, 0B, 0C), `relation_checks.py` (1 to 3), `highlights.py` and `cli.py`; `options.py` holds the run's flags.

The output is one compact table per phase (every sheet or rule with its counts and a ✓, ! or ✗), detail tables only for what failed, then a summary of every phase and a verdict panel that says what to run next. The importer and both sheet tools share this look through `etl/common/tui.py`.

Config comes from `etl/.env` (`SPREADSHEET_ID`, `GOOGLE_SA_FILE`), the same file and service-account key the importer uses.

**Phases** (each failing phase stops the run unless `--force`):

| Phase | Check |
|---|---|
| 0 | Per-column format/enum/nullable rules (`ALL_RULES`) for all nine tables, including `subscribers` and the prospects `prospect_phone` (10 digits) and `prospect_engaged` (Yes/No) columns. Also the header row: data under a blank header, columns no rule covers, duplicated headers and rule columns missing from the sheet (the import drops unnamed and unknown columns silently, and the importer's `--check-headers` only warns about them) |
| 0B | Invisible characters: flags cells containing zero-width chars, BOM, or soft hyphen, with exact sheet/row/column |
| 0C | Every cell is plain text: no smart chips (a people chip holding an email looks like text but VLOOKUP and MATCH skip it) and no dropdowns. Read from cell metadata, one extra API call per sheet |
| 1 | Uniqueness of key columns: `accounts.account_global_legal_name`, `centers.cn_unique_key`, `services.cn_unique_key`, `prospects.ps_unique_key`, and in `subscribers` the combination of email, campaign and date (the same engagement entered twice) |
| 2 / 2B | Referential integrity (`account_global_legal_name` in child sheets, `center_name` in services, `cn_unique_key` in services/functions/tech, `prospect_email` in subscribers) plus completeness (every accounts row present in alias and ticker) |
| 2C | Warning only: `prospects.prospect_engaged` is `Yes` exactly when the email has a `subscribers` row |
| 3 | Every services row has at least one service column filled |

**Cleanup (`sheets/cleanup/`).** A separate tool that fixes what can be fixed mechanically, so validate only reports what needs a person. It reads every sheet once, runs its steps in a fixed order on the in-memory copy, and writes each sheet's net changes once. Dry run by default; `--apply` writes.

| Step | What it fixes |
|---|---|
| `chips` | Smart chips turned into plain text (a link chip keeps its URL) and dropdowns removed, through the Sheets batchUpdate API |
| `artifacts` | Spreadsheet error values typed as text (`#N/A`, `#REF!`) cleared; HTML entities (`&amp;`, `&nbsp;`) decoded |
| `invisible` | Zero-width characters, BOM, soft hyphen, bidi controls in every cell (Phase 0B) |
| `whitespace` | Leading/trailing spaces, double spaces, tabs, non-breaking and other exotic spaces, `\r` line breaks; line breaks themselves are kept |
| `lists` | Services list columns and `account_hq_key_offerings`: one item per line, no bullets, no duplicates; services items also get title case and run-together regions split |
| `links` | Link columns: one URL per line, bullets/quotes/separators removed, tracking parameters (`utm_*`, `trk`, `originalSubdomain`, `gclid`) and `#:~:text=` highlights dropped, LinkedIn links on one scheme and host; lines still not a URL are reported, never changed |
| `formats` | Values Phase 0 would reject that have one obvious fix: dates to `6-May-2025`, full month names, `2015.0` years, allowed-value casing/spacing, ISO `IN`, email `mailto:`, domain case and Cyrillic/Greek lookalike letters, phones to 10 digits, ALL CAPS or all-lowercase prospect names capitalised |
| `references` | Child-sheet keys that match the parent except for case, curly quotes or dash style take the parent's spelling; stale `cn_unique_key` prefixes are rebuilt and renamed in every key sheet (Phase 2 case warnings) |

Formula cells are never written (many columns are formulas, such as `tech.account_global_legal_name` and the range columns); a fix a step wanted on one is listed at the end instead. Order matters: entities, invisible characters and whitespace go first so every later step sees clean text, and references run last because names only compare equal once both sheets are clean. Column rules (`ALL_RULES`, `VALIDATION_RULES`, `INVISIBLE_CHARS`) live in `etl/sheets/rules.py`, imported by both tools, so a rule change applies to both. Each step lives in its own module: `text.py` (chips, artifacts, invisible, whitespace), `lists.py`, `links.py`, `formats.py`, `references.py`; `workbook.py` is the in-memory copy and the single write.

```bash
etl/cleanup.sh --report changes.csv                                  # the wrapper: same flags, --help, works from any directory
uv run --directory etl python -m sheets.cleanup                        # preview every step
uv run --directory etl python -m sheets.cleanup --apply                # show the report, confirm y/N, then write
uv run --directory etl python -m sheets.cleanup --apply --yes          # write without asking (required when not run from a terminal)
uv run --directory etl python -m sheets.cleanup --steps formats        # one step (or --skip references)
uv run --directory etl python -m sheets.cleanup --sheets centers       # only change these sheets
uv run --directory etl python -m sheets.cleanup --report changes.csv   # full change list
```

Typical order: `etl/cleanup.sh`, then `etl/cleanup.sh --apply`, then `etl/validate.sh`, then `etl/import.sh`.

---

## Related Files

| File | Purpose |
|---|---|
| `etl/importer/` | The Sheets → Postgres importer (§1); `python -m importer` |
| `etl/importer/tables.py` | `TABLE_DEFS`, `IMPORT_ORDER`, `CONSTRAINTS_SQL`, `TYPE_MAPPING` |
| `etl/importer/master-schema.json` | Per-table column/type definitions, read by `clean_dataframe`, `check_sheet_headers` and `run_validate` |
| `etl/importer/cache.py` | Post-import dashboard cache purge (§1b) |
| `etl/sheets/validate/` | Pre-import sheet validation (§7) |
| `etl/sheets/cleanup/` | Ordered pre-import sheet cleanup (§7) |
| `etl/sheets/rules.py` | Column, uniqueness, reference and completeness rules shared by validate and cleanup |
| `etl/sheets/cell_meta.py` | Finds smart chips and dropdowns from cell metadata, for validate Phase 0C and the cleanup chips step |
| `etl/common/` | Shared by every tool: `env.py` (loads `etl/.env`), `google.py` (service account, client, retries), `tui.py` (terminal output) |
| `etl/pyproject.toml`, `etl/uv.lock` | Python dependencies and `uv` project config |
| `etl/importer/import_logs/logs/` | Per-run text log files (`setup_logger`) |
| `etl/importer/import_logs/snapshot/` | Per-run JSON DB snapshots (`run_snapshot`) |
| `documentation/backend/table-relationships.md` | FK constraints, import order, table hierarchy |
| `documentation/backend/schema-migration-guide.md` | Column-level schema reference |
| `documentation/2026-07-29-perf-and-data-hygiene.md` | Cache-cadence and invisible-character incident write-up |
| `documentation/security-249-progress.md` | Redis cache layer and ETL purge integration notes |
