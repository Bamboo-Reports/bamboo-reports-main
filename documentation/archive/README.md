# Archive

Historical documents kept for context. They describe the code as it was when they were written and are not kept in sync with the app. Do not treat anything here as current.

| File | What it was |
|---|---|
| `SECURITY-VERIFICATION-REPORT.md` | Point-in-time security verification (2026-06-29) |
| `data.md` | Data exposure audit of the retired `/api/dashboard` route (was `issues/data.md`) |
| `security-249-progress.md` | Progress log for the #249 server-side filtering and data-exposure work |
| `2026-07-29-perf-and-data-hygiene.md` | Session log: cache TTL, Brandfetch, invisible-character cleanup |
| `filtering-sql-parity-report.md` | #249 Phase 2 parity verification on a dated warehouse snapshot |
| `redis-cache-benchmark.md` | One-off Upstash Redis cache benchmark (2026-07-08) |
| `filter-column-ui-label-map.json` | Old machine-readable label map. `lib/config/filters.ts` is now the source of truth |
| `sql/alias-table-migration.sql` | Superseded: the ETL now creates the `alias` table itself |
| `sql/account-notifications-migration.sql` | Superseded by `ensure_notification_tables` in `etl/importer/changes.py` |
| `sql/notification-simplification-migration.sql` | Superseded by `ensure_notification_tables` in `etl/importer/changes.py` |

Current docs live in `documentation/` (see the index in the root `README.md`).
