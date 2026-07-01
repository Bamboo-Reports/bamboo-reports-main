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

**All tests green: 444/444.** Run with `npx vitest run`. The real-data
integration tests are gated on `DATABASE_URL` and skip without it.

## PENDING

### Phase 3 - Client cutover (the remaining hard part; closes the bypass)

This rewrites the app's core data layer. It's coupled: `hooks/use-dashboard-data.ts`
and `hooks/use-dashboard-filters.ts` feed EVERY tab/map/dialog/chart/facet/search,
so it can't be done tab-by-tab in isolation, and the bypass only closes at the end
when `/api/dashboard` is deleted.

Remaining sub-tasks:
- [ ] `GET /api/centers/map` - server city/state aggregation (mirror
      `components/maps/centers-map.tsx` cityData + `centers-choropleth-map.tsx`
      stateAggregates + scale reference). Build alongside the map cutover.
- [ ] `GET /api/accounts/[name]/related` - an account's centers/prospects/tech/
      services for the detail dialog (fetch-by-account).
- [ ] New server-backed data hook; wire dashboard behind a flag (keep old path
      until proven).
- [ ] Migrate tabs (`components/tabs/*`) to server pagination + sort; wire
      summary/facets/charts endpoints in place of client computation.
- [ ] Migrate maps to `/api/centers/map`.
- [ ] Migrate detail dialogs + `handleOpenFavorite` to `/api/accounts/[name]/related`.
- [ ] Migrate global search + account autocomplete to the server endpoints; delete
      the in-browser `buildSearchIndex` path.
- [ ] Retire `GET /api/dashboard`; delete client-side filtering (`getFilteredData`
      usage, full-load in `use-dashboard-data`, `use-dashboard-filters` engine).
- Recommended approach: incremental, with the dev server running and each step
  visually verified (filters, pagination, sort, maps, dialogs, search), keeping the
  old path intact until the new one is proven.

### Phase 4 - Export by filter

- [ ] `lib/exports/server-builder.ts`: add a build-by-filters mode (reuse
      `filtering-sql`).
- [ ] `POST /api/exports/generate`: accept a `{ filters, datasets }` body variant.
- [ ] Client "export all filtered" sends filter state instead of enumerating keys
      (cross-page select-all survives pagination).

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
