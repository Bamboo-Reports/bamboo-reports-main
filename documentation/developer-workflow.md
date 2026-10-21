# Developer Workflow & Contribution Guide

This guide is for developers maintaining or extending the Bamboo Reports application. It covers setup, common tasks, coding standards, and troubleshooting.

---

## 1. Setup & Installation

Setup lives in the root README so there is one copy to maintain:

- Prerequisites, clone, install and first run: [Getting Started](../README.md#getting-started)
- Every environment variable, required and optional: [Environment Variables](../README.md#environment-variables)
- npm scripts: [Available Scripts](../README.md#available-scripts)
- ETL commands: [ETL Pipeline](backend/etl-pipeline.md)

---

## 2. Common Tasks

### 2.1 Adding a New Filter

To add a new filter (e.g., "Founded Year") to the sidebar:

1. **Update Type Definition:**
    Edit `lib/types.ts` to add the new field to the `Filters` interface.
    ```typescript
    export interface Filters {
      // ... existing
      foundedYear?: number[];
    }
    ```

2. **Update the SQL translation:**
    Add the clause to `lib/dashboard/filtering-sql.ts` (and the facet spec in `lib/dashboard/dashboard-core.ts` if it has a sidebar list), see [Server-Mode Dashboard](backend/server-dashboard-mode.md).

3. **Update Filter Hook:**
    Add the filter logic to `hooks/use-dashboard-filters.ts`. This is where include/exclude mode, default values, and filter counting are handled.

4. **Update UI Component:**
    Edit `components/filters/filter-sections.tsx` or `components/filters/filters-sidebar.tsx`.
    - Add a new filter section using `EnhancedMultiSelect`, `Slider`, or a custom control.

5. **Update Saved Filters (if applicable):**
    If users should be able to save this filter, ensure the key is included in the filter serialization logic in `components/saved-filters-manager.tsx`.

6. **Update the server-side SQL translation:**
    Server mode translates filters to SQL in `lib/dashboard/filtering-sql.ts`. Every new filter must be implemented there and covered by the parity suite (`tests/unit/filtering-sql-parity.test.ts`). The old client engine, `lib/dashboard/filtering.ts`, no longer runs in the app; it survives only as the reference implementation that suite compares the SQL against. See [Server-Mode Dashboard](backend/server-dashboard-mode.md).

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

### 2.3 Adding a New Chart

1. **Create Component:**
    Create `components/charts/my-new-chart.tsx`.
    - Use `highcharts` for donut charts, treemaps, and other categorical visualizations (see `components/charts/pie-chart-card.tsx`).
    - Use `recharts` via the shadcn `components/ui/chart.tsx` wrapper for line/area trend charts.

2. **Prepare Data:**
    Create a helper in `lib/utils/chart-helpers.ts` to transform raw data into the format required by the chart library.

3. **Integrate:**
    Import and place the chart in the appropriate tab file (`components/tabs/accounts-tab.tsx`, etc.).

### 2.4 Adding a New Tab

1. **Create Tab Component:**
    Create `components/tabs/my-new-tab.tsx` following the pattern of existing tabs.

2. **Add View Modes:**
    Decide which views to support (data table, chart, map) and compose accordingly.

3. **Wire to Dashboard:**
    Add the tab to the `TabsContainer` in `app/page.tsx`.

4. **Update Summary Cards:**
    If the tab has its own entity count, add it to `components/dashboard/summary-cards.tsx`.

### 2.5 Database Schema Changes

If you modify the database schema (e.g., rename a column), see [ETL Pipeline](backend/etl-pipeline.md) for how the importer (`etl/importer/`) applies schema changes and [Table Relationships](backend/table-relationships.md) if the change affects keys or FK constraints. Steps:

1. **Update `etl/importer/master-schema.json`** with the new structure.
2. **Update `documentation/backend/schema-migration-guide.md`** to log the change.
3. **Update `documentation/backend/table-relationships.md`** if the change affects primary keys, FK constraints, or import order.
4. **Update `lib/types.ts`** to match the new column names.
5. **Update the projections** in `lib/dashboard/entity-columns.ts` and the SQL in `lib/dashboard/filtering-sql.ts` to use the new column names.
6. **Update filter helpers** in `lib/utils/filter-helpers.ts` if filters reference the changed columns.
7. **Update `lib/config/filters.ts`** if a filter's `column` or UI label changed (it is the source of truth for filter labels and columns).

### 2.6 Adjusting Dashboard Panel Height

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

### 2.7 Adding Analytics Events

1. **Define the event** in `lib/analytics/events.ts` (`ANALYTICS_EVENTS` for the browser, `SERVER_ANALYTICS_EVENTS` for API routes).
2. **Track it** with `captureEvent` from `lib/analytics/client.ts` (helpers in `lib/analytics/tracking.ts`), or `captureServerEvent` from `lib/analytics/server.ts` in a Route Handler, passing the authenticated user ID as `distinctId`.
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
- **Shared Types:** All entity types live in `lib/types.ts`. Keep them in sync with `etl/importer/master-schema.json`.

### Performance Best Practices
- **Neon warehouse reads:** Use the Prisma singleton from `lib/db/prisma.ts` and wrap database calls with `queryWithRetry`.
- **Supabase user data:** Keep Auth, profiles, saved filters, account lists, export metadata, and Storage on the existing Supabase clients so RLS and Storage behavior remain intact.
- **Client Components:** Use `useMemo` for expensive data transformations (sorting/filtering 1000+ rows).
- **Row Components:** Wrap table row components with `React.memo` to prevent unnecessary re-renders.
- **Search Inputs:** Always debounce (300ms minimum).
- **Imports:** Use named imports. Avoid `import *`.

### File Organization
- **Server-only code** goes in `app/actions/` or `lib/db/`.
- **Client-only code** goes in `components/`, `hooks/`, or client-side `lib/` utilities.
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
3. **PRs:** CI (`.github/workflows/test.yml`) runs `npm run typecheck` and `npm test` on every pull request; both must pass before merging. Run `npm run lint` locally too.
4. **Branch Protection:** PRs target the `main` branch. Merges deploy automatically to Vercel.

---

## 5. Troubleshooting

This is the single troubleshooting table for the app; the README links here.

| Issue | Check | Solution |
| :--- | :--- | :--- |
| **"Database connection failed"** | Neon scaling or network | The Neon instance may be sleeping. Retry after a few seconds and verify `DATABASE_URL`. For Prisma CLI issues, also verify `DIRECT_URL`. |
| **"The dashboard could not load" screen** | Summary request failed | The alert on that screen shows the raw server message. Retry, then check the Neon instance and `DATABASE_URL`. |
| **Slow queries** | `lib/dashboard/filtering-sql.ts` | Run `EXPLAIN ANALYZE` on the generated SQL in the Neon console; the range clause shape matters (see the comment on `rangeClause`). |
| **Charts not rendering** | Data issue | Check the browser console, then the `/api/dashboard/charts` response in the network tab. |
| **Auth errors (401/403)** | Supabase config | Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Check RLS policies in the Supabase dashboard. |
| **Auth redirect loop** | Supabase config | Verify the same Supabase variables and check `useAuthGuard` behavior. |
| **Styles missing** | `globals.css` | Ensure Tailwind directives are present and `tailwind.config.ts` includes content paths for `app/` and `components/`. |
| **Map not rendering** | Basemap or local boundary request | Check browser requests to `basemaps.cartocdn.com` and confirm `public/data/admin-1.geojson` is available. |
| **Unexpected map boundaries** | Basemap boundary layers remain visible | Verify `hideBasemapBoundaries` runs after map load and the local boundary overlay loads. See [Map Boundaries](frontend/map-disputed-boundaries.md). |
| **Notifications not appearing** | Feature flag | Set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=enabled` in `.env.local` and restart the dev server. |
| **Export button disabled** | User role | Only `admin` users can export. Update the `role` column in `public.profiles`. |
| **Export fails with "Failed to archive export"** | Storage bucket | Create a **private** bucket named exactly `user-exports` in the Supabase dashboard. |
| **Export fails with "relation 'public.user_exports' does not exist"** | Schema SQL not run | Run `documentation/backend/sql/user-exports-schema.sql` against the Supabase project. |
| **"My exports" dialog empty after a successful export** | Dev-server module cache | Hard-refresh the page and restart `next dev`. |
| **PostHog events missing** | Environment variables | Verify `NEXT_PUBLIC_POSTHOG_KEY` is set, `providers.tsx` wraps the app, and `/ingest` requests return 200 (reverse proxy in `next.config.mjs`). |
| **Company logos not loading** | Brandfetch client ID | Set `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`. If Brandfetch has no logo for the domain, the monogram fallback is expected. |
| **Financial data missing** | Yahoo Finance | The Yahoo Finance API can be rate-limited. Check the `/api/financials` route logs. |
| **Skeleton and loaded layout do not line up** | Shell changed without the skeleton | Update `components/states/loading-state.tsx` or the relevant `data-skeletons.tsx` primitive. See [Standalone Screens](frontend/standalone-screens.md). |
