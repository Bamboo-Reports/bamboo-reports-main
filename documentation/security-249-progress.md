# Security #249 (data-exposure) - progress & pending

Living summary of the phased work on the data-exposure audit (#242) and its
tracked findings. All work lands on `dev-work` (feeds PR #253 into `main`).

## The goal

A viewer (blocked from the admin-only export) can call `GET /api/dashboard`
from the browser and receive the entire dataset (accounts, centers, ~64k
prospects with PII) in one response, bypassing the export gate. The dashboard
endpoint is a de-facto "export everything" endpoint.

Honest posture: because viewers legitimately see all data in the UI, their
browser must receive it, so extraction can't be made impossible. The plan makes
it **bounded and expensive**: no single call returns the whole dataset
(pagination), per-user rate + volume caps throttle scripted scraping, and bulk
retrieval stays on the admin-only export path.

## Issue status

- **#247** (Critical: dashboard exposes full dataset) - CLOSED. Under the product
  model (viewers and admins see the same data; only export differs, already
  gated) and given `account_visibility` is a GCC/non-GCC display filter (not a
  security boundary), this is by-design; the real residual is bulk extraction =
  #249.
- **#248** (profiles PII), **#250** (exports authz-before-validation), **#251**
  (export IDOR) - already CLOSED before this work.
- **#242** (umbrella audit) - OPEN.
- **#249** (rate limiting / bulk extraction) - OPEN. This is the active work.

## DONE

### Phase 1 - Guardrails (LIVE) — commit a4b0ff8

- DB-backed per-user rate limiter `lib/rate-limit/server.ts`: 429 + `Retry-After`,
  fails open on backend error, env-tunable (`DATA_RATE_LIMIT_PER_MIN`, default 60).
  Applied to `/api/dashboard` (GET/POST) and export list/download routes.
- `documentation/sql/rate-limits-migration.sql`: `rate_limit_counters` table +
  `increment_rate_limit()` function. **Applied to the Supabase project
  `qeidxxszpbzfdnqqmdkw`** (BR-USER-AUTH-NEXTJS). Verified enforcing live.
- Closed an unauthenticated hole: `getAccountFinancialInfo` (4 Yahoo calls, no
  auth) is now `GET /api/financials` (bearer auth + rate limit).
- Dropped two abandoned prior-attempt tables (`dashboard_access_log`,
  `dashboard_security_state`).

### Phase 2 - Server-filtering engine + read endpoints — commits b962075, e4cd74e, 14de99c, 9b242fb

- `lib/dashboard/filtering-sql.ts`: parameterized SQL translation of the
  in-browser filter engine (`getFilteredData`). Reproduces exact semantics
  (include/exclude sets, keyword ILIKE, null-vs-zero ranges, gcc/nonGcc/all +
  name-search bypass, the full bidirectional account/center/prospect cascade).
  Cascade = non-correlated `IN (SELECT ...)` CTEs, emitted `AS MATERIALIZED`
  (planner hint; avoids a nested-loop blow-up). Keyword/software use `ILIKE` on
  the raw column so the ETL's `pg_trgm` indexes apply.
- Parity: pg-mem (28 scenarios + 150 fuzz = 178) and **real-data vs the engine
  on the live warehouse: 72/72 exact** (see `filtering-sql-parity-report.md`).
- Indexes: no new migration - the ETL (`etl/V2/main.py apply_indexes`) already
  creates every needed btree + `pg_trgm` index; the SQL was made index-friendly.
- Five read endpoints (authed + rate-limited, NOT yet consumed by the UI):
  - `POST /api/dashboard/summary` - filter-aware + full counts (incl. headcount).
  - `POST /api/dashboard/facets` - 23 facet value+count lists (facet-excludes-
    itself) + base ranges.
  - `POST /api/dashboard/charts` - per-section grouped aggregations (top-10, city
    Others).
  - `GET /api/search` - accounts/centers/prospects, 10/group + totals.
  - `GET /api/accounts/autocomplete` - name suggestions + "Known as" alias.
  - Shared plumbing: `lib/dashboard/filters-request.ts` (parseFilters/
    resolveAccess), `lib/db/warehouse.ts` (Neon HTTP, array-param-safe),
    `buildEntityAggregateQuery`, `lib/search/search-sql.ts`.

### Phase 3 (server foundation) - Paginated query endpoints — commits 384f002, 0edfeb4

- `lib/dashboard/entity-query.ts` (`queryEntity`) + `entity-query-route.ts`
  (shared handler).
- `POST /api/{accounts,centers,prospects}/query`: `{ rows, total, page, pageSize }`
  with server pagination + whitelisted sort (unknown sort col -> default order, no
  injection). Full column projections match the current fetcher shapes; projection
  columns verified against the live warehouse.

### Phase 3 (client cutover) - DONE behind a flag — commits 1586763, 680103c, 2a803df

The dashboard runs fully server-backed when `NEXT_PUBLIC_DASHBOARD_SERVER_MODE=1`
(build-time env var; the old `/api/dashboard` path is untouched when unset).
User-verified on the dev server 2026-07-02; counts match the parity report
(defaults 2,431 A / 5,888 C / 61,830 P; visibility ALL 2,675 / 6,305 / 63,838).

- [x] `POST /api/centers/map` - filter-aware city + state aggregations (parity
      proven exact vs the client map computations on live data).
- [x] `GET /api/accounts/[name]/related` + lookup endpoints
      `GET /api/centers/[key]`, `GET /api/prospects/[id]` (dialogs, favorites,
      recent items).
- [x] `lib/dashboard/api-client.ts` (typed authed fetchers) +
      `hooks/use-server-dashboard-data.ts` (summary/facets/charts/map + per-entity
      paginated pages; un-narrowed ranges are sent wide-open, cast
      `::double precision` in `filtering-sql.ts` so int columns don't overflow).
- [x] Tabs on server pagination + whitelisted sort; maps on pre-aggregated data;
      dialogs self-fetch; global search + account autocomplete server-backed
      (`/api/search` hydrates full rows; autocomplete carries visibility).
- Deploy note: enabling server mode in any deployment requires setting
  `NEXT_PUBLIC_DASHBOARD_SERVER_MODE=1` at build time (set in `.env.local` for dev).
- Known trade-off: filter changes now round-trip to the server (accepted;
  see perf polish below).

**All tests green: 512/512.** Run with `npx vitest run`. The real-data
integration tests are gated on `DATABASE_URL` and skip without it.

## PENDING

### Server-mode notes

- Cross-page "select all" is limited to the visible page in server mode;
  "export all filtered" (now filter-based, see Phase 4) covers the
  whole-filtered-set workflow.

### Retire `/api/dashboard` (the point of no return; do AFTER Phase 4)

- [ ] Delete `app/api/dashboard/route.ts` + `hooks/use-dashboard-data.ts`, make
      server mode unconditional (drop the flag), remove old-path branches in
      `app/page.tsx`, drop unused fetchers in `app/actions/data.ts` (keep
      `lib/dashboard/filtering.ts` as the parity-test reference engine).
- Plan: build on a separate branch and merge only on explicit go-ahead, so the
  flagged build can soak first.

### Perf polish (later, optional)

- Debounce filter changes; fetch charts/map/tab pages lazily per visible view;
  cache or partially refresh facets (the heaviest endpoint, ~23 aggregate
  queries); keep previous results rendered while refetching. A server-side cache
  layer was floated as a future option.

### Phase 4 - Export by filter - DONE — commit 84c6b20

- [x] `lib/exports/server-builder.ts`: filters mode via the proven SQL builders
      with `columns: "*"` (services via an `in (<centers subquery>)` wrap),
      executed through `queryWarehouse`; key lists ignored in this mode.
- [x] `POST /api/exports/generate`: `filters` body field (parseFilters), takes
      precedence over key lists. Admin role gate + hourly rate limit unchanged.
- [x] Filtered/full `services` counts added to `POST /api/dashboard/summary`.
- [x] Client: server-mode `exportPayload` sends filter state + summary-based row
      counts; `ExportDialog` `rowCounts`/`filters` props; row-selection exports
      unchanged. 518/518 tests green incl. gated services-wrap parity.

### Housekeeping

- [ ] Close #249 when the cutover + export-by-filter land; consider closing the
      #242 umbrella.

## Key facts for next session

- **Branch flow:** feature branch -> `git merge --ff-only` into `dev-work` -> push.
  `dev-work` -> `main` via PR #253. Never commit to `main`.
- **Two databases:** Neon warehouse (accounts/centers/prospects/... - filtering &
  reads via `queryWarehouse`) vs Supabase (`qeidxxszpbzfdnqqmdkw` - auth, profiles,
  user_exports, rate_limit_counters). See `[[supabase-and-databases]]` memory.
- **Everything built so far is invisible to the app** (new code beside the current
  path). The app still runs on `/api/dashboard` today.
- Full plan lives in the session plan file; this doc is the canonical summary.
