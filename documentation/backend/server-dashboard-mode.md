# Server-Mode Dashboard

> **Scope:** The server-backed dashboard data path behind `NEXT_PUBLIC_DASHBOARD_SERVER_MODE` (#249): the SQL filter translation, the paginated/aggregated read endpoints, the client fetch layer, and export-by-filter. Background: [security-249-progress.md](../security-249-progress.md) (phased plan and rollout state) and [filtering-sql-parity-report.md](filtering-sql-parity-report.md) (parity verification).

## Why it exists

Historically the dashboard loaded the ENTIRE warehouse into the browser via `GET /api/dashboard` (accounts, centers, ~64k prospects with PII in one response) and filtered client-side (`lib/dashboard/filtering.ts`, `getFilteredData`). That made the dashboard a de-facto "export everything" endpoint, bypassing the admin-only export gate (#247/#249), and shipped a multi-MB payload on every load.

Server mode inverts this: the client sends its `Filters` object to the server, the server translates it to parameterized SQL against the Neon warehouse, and the client receives only paginated rows and pre-computed aggregates. No single call can return the whole dataset; per-user rate limits throttle scripted scraping.

## The flag

```ts
// lib/config/server-dashboard.ts
export function isServerDashboardEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DASHBOARD_SERVER_MODE === "1"
}
```

- `NEXT_PUBLIC_` prefix: the value is inlined into the client bundle at **build time**. Enabling it in a deployment means setting the env var and rebuilding (`.env.local` for dev).
- `app/page.tsx` reads the flag once (`serverMode`) and branches every data source: `useDashboardData` (legacy, full payload) runs with `enabled: !serverMode`; `useServerDashboardData` runs with `enabled: serverMode && authReady`. View data (`viewAccounts`, `viewAvailableOptions`, chart data, summary counts, maps) picks the server responses when on, the client-filtered arrays when off.
- **When off**, nothing changes: the legacy `/api/dashboard` full-payload path and the in-browser engine still run. The new endpoints exist either way (they are additive), they are just not consumed.
- Retirement of the legacy path is built on `feat/249-retire-dashboard` and pending merge (see [Rollout state](#rollout-state)).

## Endpoint catalog

All endpoints require a Supabase bearer token (`extractBearerToken` + `resolveAuthenticatedUserId`, 401 otherwise) and are per-user rate limited (`enforceRateLimit`, 429 + `Retry-After`). All are `dynamic = "force-dynamic"`; the filter-driven ones set `maxDuration = 60` and cache responses via `getOrCompute` (L1 in-process + L2 Upstash Redis, `x-no-cache: 1` bypasses reads). Filter bodies are `{ filters }`, coerced by `parseFilters`.

| Endpoint | Method | Purpose | Params / body | Response |
|---|---|---|---|---|
| `/api/dashboard/core` | POST | Summary and facets together (what the dashboard fetches on every filter change: one auth, one rate-limit bump, both cache keys) | `{ filters }` | `{ summary, facets }` |
| `/api/dashboard/summary` | POST | Filtered + full counts: accounts, centers, upcoming centers, prospects, headcount, services | `{ filters }` | `{ filtered, full }` count objects |
| `/api/dashboard/facets` | POST | 23 facet option lists (value + count, facet-excludes-itself) plus base min/max ranges for revenue, years-in-India, center inc year | `{ filters }` | `{ options, ranges }` |
| `/api/dashboard/charts` | POST | Grouped counts per section (top-10; center city as top-5 + "Others"); null/empty grouped as "Unknown" | `{ filters }` | `{ account, center, prospect }` chart arrays |
| `/api/accounts/query` | POST | Paginated filtered account rows | `{ filters, page, pageSize, sort }` | `{ rows, total, page, pageSize }` |
| `/api/centers/query` | POST | Paginated filtered center rows | same | same |
| `/api/prospects/query` | POST | Paginated filtered prospect rows | same | same |
| `/api/centers/map` | POST | Map aggregates over the filtered centers: per-city bubbles (representative lat/lng) and per-state choropleth rows | `{ filters }` | `{ cities, states }` |
| `/api/search` | GET | Global search across accounts/centers/prospects, 10 hits per group hydrated to full rows, plus total match counts | `?q=` (min length gate) | `{ accounts, centers, prospects, total }` |
| `/api/accounts/autocomplete` | GET | Account name suggestions, including "Known as" alias matches and visibility metadata | `?q=` | `{ suggestions }` |
| `/api/accounts/[name]/related` | GET | Account detail dialog payload: account row + its centers, services, tech, prospects (each gated by section entitlement) | path param | `{ account, centers, services, tech, prospects }` |
| `/api/centers/[key]` | GET | One center by `cn_unique_key` with services and tech (center dialog, favorites) | path param | `{ center, services, tech }` |
| `/api/prospects/[id]` | GET | One prospect by `ps_unique_key` (favorites, recent items) | path param | `{ prospect }` |

Notes:

- The three `/query` routes are 9-line wrappers around `handleEntityQuery` in `lib/dashboard/entity-query-route.ts`. Page size defaults to 51 and is clamped to 100 (`MAX_PAGE_SIZE`), so no single call returns the dataset.
- The rate-limit RPC is fired before body parsing and awaited after the (usually cached) compute, so the round trips overlap.
- `/api/search` and `/api/accounts/autocomplete` cache for 24h keyed on the term only (warehouse data is weekly-static); the ETL purges `dash:*` keys after import.
- Row shapes come from `lib/dashboard/entity-columns.ts` (`ACCOUNT_PROJECTION`, `CENTER_COLUMNS`, `PROSPECT_COLUMNS`, ...), mirroring the legacy fetchers so components render server rows unchanged. `ACCOUNT_PROJECTION` casts `account_hq_revenue::float8` and pulls `account_hq_stock_ticker` from the ticker table via a correlated subquery.

## SQL filter translation

`lib/dashboard/filtering-sql.ts` is the server-side twin of the in-browser engine (`lib/dashboard/filtering.ts`, `getFilteredData`). It turns a `Filters` object into a parameterized `SqlQuery = { text, values }` executed by `queryWarehouse` (Neon HTTP driver; chosen over Prisma because the SQL binds array parameters, `= any($n::text[])`). All user values enter as bound parameters via a `Params` accumulator; column lists, ORDER BY, and aggregate SELECTs are always code-controlled.

### Clause builders (each mirrors a client matcher)

| Builder | Client matcher | Semantics |
|---|---|---|
| `valueClause` | `createValueMatcher` | Exact equality against include/exclude sets. Include = OR whitelist (`col = any($n::text[])`); exclude = blacklist and exclude wins. NULL passes the exclude test but fails when include values are present. |
| `keywordClause` | `createKeywordMatcher` | Case-insensitive LITERAL substring: `col ilike '%kw%'` with `\ % _` escaped. OR across includes, NOT any exclude, NULL treated as `""` (handled explicitly so the raw column stays index-friendly for the ETL's pg_trgm GIN indexes; wrapping in `lower(coalesce(...))` would force a seq scan). |
| `rangeClause` | `rangeFilterMatch` | `col is null or col = 0 or (col between bounds)`: a real 0 is treated like NULL and gated by the `includeNull` flag. The column is compared raw (no `coalesce`) and the bounds are bound as `::bigint`, so the planner keeps the column statistics; wrapping the column or casting to double precision made it estimate one row and pick nested loops (1.2s to 12s per query instead of tens of ms). `bigint` holds `Number.MAX_SAFE_INTEGER`, and integer columns compare against it without overflow. |
| `visibilityClause` | `matchAccountVisibility` | `gcc` => `account_visibility = 'include'`, `nonGcc` => `'exclude'`, `all` => no clause. Skipped entirely when an account-name keyword search is active. |
| `softwareClause` | `buildCenterSoftwareIndex` | Center membership in matching tech rows. The exclude subquery filters `cn_unique_key is not null` because a single NULL makes `not in (...)` never true, which would silently drop every center (the client engine skips keyless tech rows the same way). |

### The cascade

The client engine's bidirectional narrowing (account filters narrow centers/prospects, prospect filters narrow back to accounts/centers, function/software filters narrow centers, and an account survives only with at least one surviving center when centers are enabled) is expressed as non-correlated `IN (SELECT ...)` CTEs, one per engine Set:

```
acc0              accounts passing the account predicate
func_centers      centers with a matching function row
prospect_accounts accounts owning a matching prospect
surviving_centers centers passing center predicate + memberships above
final_accounts    acc0 restricted by prospect_accounts and surviving_centers
```

`buildWith` resolves only the CTEs a query transitively needs (driven by `computeFlags`, which mirrors the engine's `hasAccountFilters` / `hasProspectFilters` flags and section entitlements) and emits them `AS MATERIALIZED`: a pure planner hint that avoids a nested-loop blow-up from under-estimated CTE cardinalities (`materialized: false` for pg-mem, which does not parse the keyword). Predicates are built at emit time so parameter order always matches SQL text order.

Public builders: `buildAccountsQuery` / `buildCentersQuery` / `buildProspectsQuery` (+ `...CountQuery` variants) with `columns` / `orderBy` / `limit` / `offset` options, and `buildEntityAggregateQuery(entity, filters, access, select, { groupBy, where })`, which reuses the same cascade for the summary, charts, and map endpoints. `buildFacetCountsQuery(specs, filters, access)` emits the cascade once and one `union all` branch per facet, so the 23 sidebar lists are one statement when no facet is active (one extra statement per active facet, which excludes itself). A disabled section returns a `where false` query. `lib/dashboard/centers-map.ts` builds the city/state map aggregates on top of `buildEntityAggregateQuery`.

### Parity guarantee

The SQL MUST produce exactly the same id-sets as the client engine. This is enforced by golden-parity tests: `tests/unit/filtering-sql-parity.test.ts` runs both against pg-mem fixtures (28 hand-picked scenarios + 150 seeded fuzz combinations), and gated integration tests replay scenarios on the live warehouse (72/72 exact). Numbers and methodology: [filtering-sql-parity-report.md](filtering-sql-parity-report.md).

### Request parsing

`lib/dashboard/filters-request.ts` is the trust boundary:

- `parseFilters(body.filters)` coerces an untrusted body into a valid `Filters`: unknown/malformed fields fall back to defaults, value arrays are shape-checked (`{ value, mode }`), ranges must be finite number pairs, and `sanitizeFilters` resets filters disabled by deployment config.
- `resolveAccess()` resolves server-side section entitlements (accounts/centers/prospects enabled), mirroring the client.

## Ordering rules

`lib/dashboard/entity-query.ts` (`resolveOrder`, commits f380b5a and f4603a9):

- Sort columns are whitelisted per entity (`sortable` sets); an unknown column falls back to the default. Default sort for all three entities is `account_global_legal_name` ascending.
- **Numeric columns** (a fixed `NUMERIC_SORT_COLUMNS` set matching the warehouse schema) sort natively with `nulls last` in both directions.
- **Text columns** sort in three classes via `textOrder`: symbols first, then digits, then letters (case-insensitive, `lower(col) collate "C"`), with NULLs always last regardless of direction. The default collation interleaves punctuation and case, which reads as random in the table.
- Every ORDER BY ends with the entity's **tiebreak columns** to make the ordering total. Pages are fetched one query per page; a non-total ordering lets the planner return tied rows in a different order per page (duplicated and missing rows). Accounts tiebreak on the name, centers on `cn_unique_key`; prospects have no reliable primary key (`ps_unique_key` is nullable and non-unique) so they tiebreak through a column chain reproducing the ETL's row identity.

Order behavior is covered by `tests/unit/entity-query-order.test.ts`.

## Client side

`lib/dashboard/api-client.ts` is the typed fetch layer: every call attaches the current Supabase session token, `cache: "no-store"`, optionally `x-no-cache: 1`, and throws `ApiClientError` (with a friendlier message on 429). One fetcher per endpoint (`fetchDashboardSummary`, `fetchDashboardFacets`, `fetchDashboardCharts`, `fetchCentersMap`, `fetchEntityPage`, `fetchSearch`, `fetchAccountAutocomplete`, `fetchAccountRelated`, `fetchCenterDetail`, `fetchProspectById`).

`hooks/use-server-dashboard-data.ts` orchestrates everything the dashboard renders:

- **Canonical wire key.** Filters are normalized (`normalizeFiltersForServer`: a range still spanning the known base range is sent wide-open `[0, MAX_SAFE_INTEGER]` so results do not depend on when base ranges loaded) and serialized to `effectiveKey`. All fetches and caches key off it.
- **Debounce.** Filter changes debounce 350ms before becoming effective; a state already in the client cache applies immediately (removing a filter snaps back).
- **What fetches when.**
  - Summary + facets: always (cards and sidebar are always visible), fetched together from `/api/dashboard/core`.
  - Charts: only while a chart view is visible.
  - Map aggregates: only while a map view is visible; plus one unfiltered `fetchCentersMap` for the choropleth color scale, fetched once after a map is first shown.
  - Entity pages: only the active tab fetches, keyed by `entity:filters:page:sort`.
  - Background prefetch: ~400ms after a state settles, whatever the visible effects are not fetching (charts, map, inactive tabs' pages) warms the cache fire-and-forget, so view/tab switches feel instant.
- **Client cache.** Per-response LRU maps (40 entries, session lifetime) keyed on the wire filters; revisited filter states restore with zero network calls. `reload()` clears them and sets a 5s `x-no-cache` window so refresh actually recomputes from the warehouse.
- **Staleness signalling.** `appliedKeys` records which key each piece of state was rendered for; the derived `pending` flags mean "showing the previous state while a newer one loads" and drive per-section skeletons. Request ids guard against out-of-order responses.

In legacy mode (`lib/dashboard/charts.ts` and friends) the same chart shapes are computed in the browser over the filtered arrays; server mode replaces them with `/api/dashboard/charts` responses of the same shape.

## Export by filter

In server mode there is no client-side list of every filtered key, so "export all filtered" sends the **filter state** instead of key lists (#249 Phase 4):

- `POST /api/exports/generate` accepts a `filters` body field. When present it takes precedence: the route runs it through `parseFilters` + `resolveAccess` and calls `buildServerExport({ datasets, filters, access })`; the legacy `accountNames` / `centerKeys` / `prospectKeys` / `keylessProspectIds` lists are ignored.
- `lib/exports/server-builder.ts` then fetches each dataset through the proven SQL builders with `columns: "*"` (`buildAccountsQuery` / `buildCentersQuery` / `buildProspectsQuery` via `queryWarehouse`). Services have no filter engine of their own: they are wrapped as `where cn_unique_key in (<centers subquery>)` over the surviving centers, matching the filtered services count on `/api/dashboard/summary`.
- Without `filters`, the builder keeps the legacy Prisma key-list path (used by precise row-selection exports, which are unchanged).
- The admin role gate, hourly export rate limit, Storage upload, and audit logging are identical in both modes; see [user-exports.md](user-exports.md).

## Adding a new filter in server mode

Both engines must change in lockstep or parity breaks:

1. Add the field to `Filters` (`lib/types`), defaults (`lib/dashboard/defaults.ts`), and the client engine matcher in `lib/dashboard/filtering.ts`.
2. Add the SQL clause in `lib/dashboard/filtering-sql.ts`: the appropriate predicate (`accountPredicate` / `centerSurvivesPredicate` / `prospectPredicate`) via `valueClause` / `keywordClause` / `rangeClause`, AND the corresponding flag in `computeFlags` (`haf` / `rawHpf` / `hff` / `hsf`) so the cascade CTEs activate.
3. Register the field in `lib/dashboard/filters-request.ts` (`VALUE_ARRAY_KEYS` for value arrays, or explicit coercion for ranges/booleans). A field missing here is silently dropped server-side.
4. If it should appear in the sidebar facet lists, add a `FacetSpec` to `FACETS` in `lib/dashboard/dashboard-core.ts`.
5. Extend `tests/unit/filtering-sql-parity.test.ts` with scenarios exercising the new filter (include, exclude, null values) and run the gated real-data parity tests against a live `DATABASE_URL` before shipping.

Keyword filters on new columns should stay as raw-column `ILIKE` and get a pg_trgm index in the ETL (`etl/V2/main.py apply_indexes`) if the column is large.

## Rollout state

Per [security-249-progress.md](../security-249-progress.md):

- Server mode is fully built and user-verified behind the flag; counts match the parity report. The legacy `/api/dashboard` full-payload path still exists and is what runs whenever the flag is unset.
- Retirement is BUILT on branch `feat/249-retire-dashboard`: deletes `app/api/dashboard/route.ts`, `hooks/use-dashboard-data.ts`, `app/actions/data.ts`, and the flag module, making server mode unconditional. `lib/dashboard/filtering.ts` is kept as the parity-test reference engine. Merge is pending user go-ahead.
- Known trade-offs in server mode: filter changes round-trip to the server (mitigated by the client/server caches), and cross-page "select all" is limited to the visible page (export-by-filter covers the whole-filtered-set workflow).
- Response caching (L1 memory + L2 Upstash Redis, ETL purge) is documented in the progress log; the legacy route's SWR cache is in [api-caching-swr.md](api-caching-swr.md).

## Related Files

| Path | Purpose |
|------|---------|
| `lib/config/server-dashboard.ts` | The `NEXT_PUBLIC_DASHBOARD_SERVER_MODE` flag |
| `lib/dashboard/filtering-sql.ts` | Filters to parameterized SQL: clause builders, cascade CTEs, entity/aggregate query builders |
| `lib/dashboard/filtering.ts` | Client filter engine (legacy path; parity reference) |
| `lib/dashboard/filters-request.ts` | `parseFilters` (untrusted body coercion) + `resolveAccess` (section entitlements) |
| `lib/dashboard/entity-query.ts` | Pagination, sort whitelist, class-based text ordering, tiebreaks, `queryEntity` |
| `lib/dashboard/entity-query-route.ts` | Shared handler for the three `/query` routes (auth, rate limit, cache) |
| `lib/dashboard/entity-columns.ts` | Column projections shared by query/search/lookup endpoints |
| `lib/dashboard/centers-map.ts` | City/state map aggregate SQL |
| `lib/dashboard/account-related.ts` | Account detail payload assembly |
| `lib/dashboard/headcount.ts` | Headcount-excluded center types (client twin of the summary SQL) |
| `lib/db/warehouse.ts` | `queryWarehouse`: Neon HTTP driver, array-param-safe |
| `lib/dashboard/api-client.ts` | Typed bearer-authed client fetchers |
| `hooks/use-server-dashboard-data.ts` | Client orchestration: debounce, lazy fetch, prefetch, LRU cache, pending flags |
| `app/api/dashboard/{core,summary,facets,charts}/route.ts` | Aggregate endpoints |
| `lib/dashboard/dashboard-core.ts` | `computeSummary` / `computeFacets` shared by the core, summary and facets routes; facets run as one union-all statement per filter group via `buildFacetCountsQuery` |
| `app/api/{accounts,centers,prospects}/query/route.ts` | Paginated row endpoints |
| `app/api/centers/map/route.ts` | Map aggregates endpoint |
| `app/api/search/route.ts`, `app/api/accounts/autocomplete/route.ts` | Server-backed search and autocomplete |
| `app/api/accounts/[name]/related/route.ts`, `app/api/centers/[key]/route.ts`, `app/api/prospects/[id]/route.ts` | Lookup endpoints (dialogs, favorites) |
| `app/api/exports/generate/route.ts`, `lib/exports/server-builder.ts` | Export-by-filter |
| `tests/unit/filtering-sql-parity.test.ts` | pg-mem golden-parity suite (engine vs SQL) |
| `tests/api/dashboard-summary-route.test.ts` | Example route test (auth, 429, metrics, failure) |
| `documentation/backend/filtering-sql-parity-report.md` | Real-data parity verification |
| `documentation/security-249-progress.md` | Phased #249 plan, rollout and retirement state |
