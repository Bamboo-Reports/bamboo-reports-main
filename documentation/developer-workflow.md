# Developer Workflow & Contribution Guide

This guide is for developers maintaining or extending the Bamboo Reports application. It covers setup, common tasks, coding standards, and troubleshooting.

---

## 1. Setup & Installation

### Prerequisites
- Node.js 20.9+
- npm (v9+)
- Access to the Neon DB connection string
- Access to the Supabase project credentials

### Local Environment

1. **Clone & Install:**
    ```bash
    git clone git@github.com:Bamboo-Reports/bamboo-reports-main.git
    cd bamboo-reports-main
    npm install
    ```

2. **Environment Variables:**
    Copy `.env.example` to a single `.env` file (the only env file the app and tests read) and fill in the secrets.
    ```bash
    cp .env.example .env
    ```

    Required variables:
    - `DATABASE_URL`: Neon PostgreSQL pooled connection string, used by the warehouse read endpoints (`lib/db/warehouse.ts`) and Prisma
    - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public key
    - `SUPABASE_SERVICE_ROLE_KEY`: Server-only secret for the export audit log and Storage archive (see [User Exports](backend/user-exports.md))

    Optional variables:
    - `DIRECT_URL`: Direct Neon connection string for Prisma CLI commands
    - `DASHBOARD_CACHE_TTL_MS`: Response cache TTL override (code default 10 min; 8 days recommended since the ETL purges the cache weekly)
    - `EXPORT_RATE_LIMIT_PER_HOUR`: Max exports per user per rolling hour, default 20
    - `DATA_RATE_LIMIT_PER_MIN`: Max requests per user per minute on data endpoints, default 60 (non-production `NODE_ENV`s count in their own Redis keys)
    - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: optional Redis L2 for the response cache and rate-limit counters; `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work (see [Caching and Rate Limiting](backend/caching-and-rate-limiting.md))
    - `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`: Analytics
    - `NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_POSTHOG_ENABLE_RECORDING`, `NEXT_PUBLIC_POSTHOG_DEBUG`: set to `true` to enable analytics in local dev, session recording, or PostHog debug logging
    - `LOG_LEVEL` / `NEXT_PUBLIC_LOG_LEVEL`: logger level (`debug`, `info`, `warn`, `error`)
    - `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`: Company logos (Brandfetch)
    - `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`: `enabled` (as in `.env.example`) or `disabled` to hide the bell and recently-updated dots
    - `NEXT_PUBLIC_MAINTENANCE_MODE`: set to `true` to show a maintenance page instead of the dashboard

    No env var is needed for the header environment badge: it shows **DEV** automatically under `npm run dev` and **PREVIEW** on Vercel preview deployments (`getDevEnvironment()` in `lib/config/environment.ts`), and is hidden in production.

3. **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint checks |
| `npm run typecheck` | Run TypeScript compiler checks |
| `npm run test` | Run Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run prisma:generate` | Regenerate the Prisma Client after a schema change |

---

## 2. Common Tasks

### 2.1 Adding a New Filter

To add a new filter (e.g., "Founded Year") to the sidebar:

The Engaged prospect filter (`prospectEngagedValues`, commit `1dcbf62`) is a recent end-to-end example of every touch point below.

1. **Update Type Definition and defaults:**
    Add the field to the `Filters` interface in `lib/types.ts` and its default in `createDefaultFilters` (`lib/dashboard/defaults.ts`).
    ```typescript
    export interface Filters {
      // ... existing
      accountFoundedYearValues: FilterValue[]
    }
    ```

2. **Register it in config and metadata:**
    Add an entry to `lib/config/filters.ts` (key, label, `enabled`, type, column, table) and to the filter metadata map in `lib/analytics/filter-metadata.ts`.

3. **Accept it on the server:**
    Add the key to the known-key list in `lib/dashboard/filters-request.ts`; keys missing there are dropped before SQL translation.

4. **Update the SQL translation:**
    Add the clause to `lib/dashboard/filtering-sql.ts` (for example `valueClause("column", f.newValues, p)`) and the facet spec in `lib/dashboard/dashboard-core.ts` if it has a sidebar option list. See [Server-Mode Dashboard](backend/server-dashboard-mode.md).

5. **Mirror it in the reference engine:**
    Add the matcher and facet counts to `lib/dashboard/filtering.ts` and cover the filter in the parity suite (`tests/unit/filtering-sql-parity.test.ts`) so SQL and the reference engine stay equivalent.

6. **Update Filter Hook:**
    Add the filter to `hooks/use-dashboard-filters.ts` (snapshot and active-filter counting).

7. **Update UI Component:**
    Edit `components/filters/filter-sections.tsx` (or `filters-sidebar.tsx` for a new section).
    - Add a new filter section using `EnhancedMultiSelect`, `Slider`, or a custom control.

8. **Update summaries:**
    Count it in `calculateActiveFilters` (`lib/dashboard/filter-summary.ts`), render it on the saved filter card (`components/filters/saved-filter-card.tsx`), add it to the summary PDF key list (`lib/reports/summary-report.ts`) and the tracked snapshot (`lib/analytics/tracking.ts`). Saved filters load through `withFilterDefaults`, so older saved filters pick up the new default automatically.

### 2.2 Adjusting Deployment Access or Premium Filters

Prefer config changes over dashboard forks for client-specific packaging.

1. **Top-level section access:**
    Edit `lib/config/dashboard-access.ts`.
    - Use this to enable or disable `accounts`, `centers`, and `prospects`.

2. **Filter availability and premium reveal:**
    Edit `lib/config/filters.ts`.
    - Use `enabled` on individual filters to turn them on or off.
    - Use `showMoreEnabled` and `premiumFilterKeys` on `accounts` / `centers` to control premium `Show More` filters.

3. **Saved-filter behavior:**
    Disabled section filters and premium-disabled filters are sanitized out at load/runtime, so these changes do not require saved-filter migrations.

### 2.3 Account Lists

Account lists (uploaded client account lists, applied through the Account List filter, shareable with teammates) live in Supabase (`account_lists`, `account_list_shares`) and are expanded on the client into the exact-name filter `accountNameValues`. Code: `contexts/account-lists-context.tsx`, `lib/accounts/*`, `components/filters/account-list*.tsx`, `POST /api/accounts/match`. See [Account Lists](backend/account-lists.md) before changing them.

### 2.4 Adding a New Chart

1. **Create Component:**
    Create `components/charts/my-new-chart.tsx`.
    - Use `highcharts` for donut charts, treemaps, and other categorical visualizations (see `components/charts/pie-chart-card.tsx`).
    - Use `recharts` via the shadcn `components/ui/chart.tsx` wrapper for line/area trend charts.

2. **Prepare Data:**
    Create a helper in `lib/utils/chart-helpers.ts` to transform raw data into the format required by the chart library.

3. **Integrate:**
    Import and place the chart in the appropriate tab file (`components/tabs/accounts-tab.tsx`, etc.).

### 2.5 Adding a New Tab

1. **Create Tab Component:**
    Create `components/tabs/my-new-tab.tsx` following the pattern of existing tabs.

2. **Add View Modes:**
    Decide which views to support (data table, chart, map) and compose accordingly.

3. **Wire to Dashboard:**
    Add the tab inside the `Tabs` block in `app/page.tsx` (and export it from `components/tabs/index.ts` if you use the barrel).

4. **Update Summary Cards:**
    If the tab has its own entity count, add it to `components/dashboard/summary-cards.tsx`.

### 2.6 Database Schema Changes

If you modify the database schema (e.g., rename a column), see [ETL Pipeline](backend/etl-pipeline.md) for how `etl/V2/main.py` applies schema changes and [Table Relationships](backend/table-relationships.md) if the change affects keys or FK constraints. Steps:

1. **Update `etl/V2/master-schema.json`** with the new structure.
2. **Update `documentation/backend/schema-migration-guide.md`** to log the change.
3. **Update `documentation/backend/table-relationships.md`** if the change affects primary keys, FK constraints, or import order.
4. **Update `lib/types.ts`** to match the new column names.
5. **Update the projections** in `lib/dashboard/entity-columns.ts` and the SQL in `lib/dashboard/filtering-sql.ts` to use the new column names. A new column only reaches the UI once it is in the projection (for example the new services fields behind the AI services card, commit `11c8fff`).
6. **Update the fixtures** in `tests/fixtures/domain.ts` when a domain type gains a required field.
7. **Update filter config** in `lib/config/filters.ts` (`column` / `table`) and the reference engine in `lib/dashboard/filtering.ts` if filters reference the changed columns.
8. **Update `documentation/frontend/filter-column-ui-label-map.json`** if UI labels changed.

### 2.7 Adjusting Dashboard Panel Height

When changing map/data card heights, keep the bottom edge aligned with the left filters sidebar.

Use this rule:
- Set the panel height in one place only using `--dashboard-panel-height` on the dashboard `<main>` container in `app/page.tsx`.
- Consume the same variable in panel cards with `h-[var(--dashboard-panel-height)]` (Accounts, Centers, Prospects tabs).
- Avoid hardcoding separate `h-[calc(100vh-...)]` values per tab because they drift out of alignment.

Current implementation:
- `app/page.tsx`: `--dashboard-panel-height: calc(100dvh-18.75rem)`
- `components/tabs/accounts-tab.tsx`: Map/Data cards use `h-[var(--dashboard-panel-height)]`
- `components/tabs/centers-tab.tsx`: Map/Data cards use `h-[var(--dashboard-panel-height)]`
- `components/tabs/prospects-tab.tsx`: Data card uses `h-[var(--dashboard-panel-height)]`

If UI alignment needs tuning:
1. Edit only `--dashboard-panel-height` in `app/page.tsx`.
2. Refresh Accounts/Centers/Prospects views and confirm the sidebar and panel bottoms end on the same line.
3. Keep header compaction consistent (`CardHeader` `py-3`, `CardTitle` `text-base`) unless a redesign is intended.

### 2.8 Adding Analytics Events

1. **Define the event** in `lib/analytics/events.ts`.
2. **Track it** using helpers from `lib/analytics/tracking.ts`.
3. **Verify** in the PostHog dashboard that events are flowing.

---

## 3. Coding Standards

### Naming Conventions
- **Database Columns:** `snake_case` (e.g., `account_hq_revenue`).
- **TypeScript Variables/Props:** `camelCase` (e.g., `accountHqRevenue`).
- **Files:** `kebab-case` (e.g., `account-details-dialog.tsx`).
- **Components:** `PascalCase` (e.g., `AccountDetailsDialog`).
- **Hooks:** `use-kebab-case.ts` files, `useCamelCase` function names.

### Type Safety
- **Strict Mode:** TypeScript strict mode is enabled. Avoid using `any`.
- **Zod:** Use Zod for validating external inputs (form submissions, saved filter JSON, API parameters).
- **Shared Types:** All entity types live in `lib/types.ts`. Keep them in sync with `etl/V2/master-schema.json`.

### Performance Best Practices
- **Neon warehouse reads:** Build parameterized SQL in `lib/dashboard/filtering-sql.ts` (or a sibling builder) and run it with `queryWarehouse` from `lib/db/warehouse.ts` inside an authed, rate-limited route handler. Prisma code (`lib/db/prisma.ts`) should wrap calls with `queryWithRetry`.
- **Supabase user data:** Keep Auth, profiles, saved filters, account lists, export metadata, and Storage on the existing Supabase clients so RLS and Storage behavior remain intact.
- **Client Components:** Use `useMemo` for derived data; do not reintroduce client-side filtering of full datasets (filtering belongs in SQL since #249).
- **Row Components:** Wrap table row components with `React.memo` to prevent unnecessary re-renders.
- **Search Inputs:** Always debounce requests that hit the server.
- **Imports:** Use named imports. Avoid `import *`.
- **Icons:** Use Remix Icon (`@remixicon/react`, `Ri*Line` components); `lucide-react` is no longer installed.

### File Organization
- **Server-only code** goes in `app/api/` (route handlers), `app/actions/`, `lib/db/`, or `lib/` modules that import `server-only`.
- **Client-only code** goes in `components/`, `hooks/`, `contexts/`, or client-side `lib/` utilities.
- **Shared types** go in `lib/types.ts`.
- **Configuration** goes in `lib/config/`.
- **Validation schemas** go in `lib/validators/`.
- **Deployment packaging config** goes in `lib/config/dashboard-access.ts` and `lib/config/filters.ts`.
- **Tests** go in `tests/` mimicking the structure of the application.

### Testing
- **Framework**: We use Vitest for unit and integration testing, and React Testing Library for UI components.
- **Coverage**: Aim to maintain high test coverage, particularly for core logic and shared UI components.
- **Execution**: Run `npm run test` before opening a pull request to ensure no regressions.
- **Deep reference**: See [Testing Guide](testing-guide.md) for the Vitest config, directory conventions, and mocking patterns for Prisma/Supabase/fetch.

---

## 4. Git Workflow

1. **Branching:** Use descriptive branch names:
    - `feat/add-map-clustering`
    - `fix/sidebar-overflow`
    - `docs/update-readme`
2. **Commits:** Use conventional commit messages:
    - `feat: add new map clustering logic`
    - `fix: resolve overflow in sidebar`
    - `docs: update readme`
    - `refactor: extract filter logic into hook`
3. **PRs:** Ensure `npm run lint` and `npm run build` pass before merging.
4. **Branch Protection:** PRs target the `main` branch. Merges deploy automatically to Vercel.

---

## 5. Troubleshooting

| Issue | Check | Solution |
| :--- | :--- | :--- |
| **Styles missing** | `globals.css` | Ensure Tailwind directives are present and `tailwind.config.ts` includes content paths for `app/` and `components/`. |
| **Auth redirect loop** | Supabase config | Verify `NEXT_PUBLIC_SUPABASE_URL` and `ANON_KEY`. Check `useAuthGuard` hook behavior. |
| **Slow queries** | `lib/dashboard/filtering-sql.ts` | Run `EXPLAIN ANALYZE` on the generated SQL in the Neon console; the range clause shape matters (see the comment on `rangeClause`). |
| **Map not rendering** | Basemap or local boundary request | Check browser requests to `basemaps.cartocdn.com` and confirm `public/data/admin-1.geojson` is available. |
| **Notifications not appearing** | Feature flag | Set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=enabled` in `.env`. Restart dev server. |
| **Unexpected map boundaries** | Basemap boundary layers remain visible | Verify `hideBasemapBoundaries` runs after map load and the local boundary overlay loads. See `documentation/frontend/map-disputed-boundaries.md`. |
| **Export button disabled** | User role | Only `admin` role can export. Update the `role` column in `public.profiles`. |
| **PostHog events missing** | Environment variables | Verify `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are set. Check that `providers.tsx` is wrapping the app. |
| **Company logos not loading** | Brandfetch client ID | Set `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`. If Brandfetch has no logo for the domain, the monogram fallback is expected. |
| **Financial data missing** | Yahoo Finance | The Yahoo Finance API can be rate-limited. Check the `/api/financials` route logs for errors. |
| **Account lists not loading** | Supabase tables | Confirm the `account_lists` (and, for sharing, `account_list_shares`) migrations in `documentation/backend/sql/` have been applied. Own lists still load if only the shares table is missing. |
| **Hitting rate limits in dev** | Rate-limit counters | Non-production `NODE_ENV`s use their own Redis counters; raise `DATA_RATE_LIMIT_PER_MIN` locally if React Strict Mode double requests trip the limit. |
