# Developer Workflow & Contribution Guide

This guide is for developers maintaining or extending the Bamboo Reports application. It covers setup, common tasks, coding standards, and troubleshooting.

---

## 1. Setup & Installation

### Prerequisites
- Node.js 18.17+
- npm (v9+)
- Access to the Neon DB connection string
- Access to the Supabase project credentials
- MapTiler API key

### Local Environment

1. **Clone & Install:**
    ```bash
    git clone https://github.com/Bamboo-Reports/bamboo-reports-nextjs.git
    cd bamboo-reports-nextjs
    npm install
    ```

2. **Environment Variables:**
    Copy `.env.example` to `.env.local` and fill in the secrets.
    ```bash
    cp .env.example .env.local
    ```

    Required variables:
    - `DATABASE_URL` — Neon PostgreSQL connection string
    - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase public key
    - `NEXT_PUBLIC_MAPTILER_KEY` — MapTiler API key

    Optional variables:
    - `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` — Analytics
    - `NEXT_PUBLIC_LOGO_DEV_TOKEN` — Company logos
    - `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` — Set to `enabled` to activate notifications
    - `NEXT_PUBLIC_ENVIRONMENT_LABEL` — Set to `DEV` or `PROD` for environment badge
    - `NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID` / `NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID` — Custom map styles
    - `NEXT_PUBLIC_MAP_VIEWPOINT_ISO2` — Geopolitical boundary viewpoint (e.g., `IN`)

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

2. **Update Server Action (if needed):**
    If the filter requires server-side data, edit the relevant function in `app/actions/data.ts`.

3. **Update Filter Hook:**
    Add the filter logic to `hooks/use-dashboard-filters.ts`. This is where include/exclude mode, default values, and filter counting are handled.

4. **Update UI Component:**
    Edit `components/filters/filter-sections.tsx` or `components/filters/filters-sidebar.tsx`.
    - Add a new filter section using `EnhancedMultiSelect`, `Slider`, or a custom control.

5. **Update Saved Filters (if applicable):**
    If users should be able to save this filter, ensure the key is included in the filter serialization logic in `components/saved-filters-manager.tsx`.

### 2.2 Adding a New Chart

1. **Create Component:**
    Create `components/charts/my-new-chart.tsx`.
    - Use `recharts` for pie/donut/bar charts.
    - Use `highcharts` for treemaps or other advanced visualizations.

2. **Prepare Data:**
    Create a helper in `lib/utils/chart-helpers.ts` to transform raw data into the format required by the chart library.

3. **Integrate:**
    Import and place the chart in the appropriate tab file (`components/tabs/accounts-tab.tsx`, etc.).

### 2.3 Adding a New Tab

1. **Create Tab Component:**
    Create `components/tabs/my-new-tab.tsx` following the pattern of existing tabs.

2. **Add View Modes:**
    Decide which views to support (data table, chart, map) and compose accordingly.

3. **Wire to Dashboard:**
    Add the tab to the `TabsContainer` in `app/page.tsx`.

4. **Update Summary Cards:**
    If the tab has its own entity count, add it to `components/dashboard/summary-cards.tsx`.

### 2.4 Database Schema Changes

If you modify the database schema (e.g., rename a column):

1. **Update `documentation/database/master-schema.json`** with the new structure.
2. **Update `documentation/schema-migration-guide.md`** to log the change.
3. **Update `lib/types.ts`** to match the new column names.
4. **Update server actions** in `app/actions/data.ts` to use the new column names.
5. **Update filter helpers** in `lib/utils/filter-helpers.ts` if filters reference the changed columns.
6. **Update `documentation/filter-column-ui-label-map.json`** if UI labels changed.

### 2.5 Adjusting Dashboard Panel Height

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

### 2.6 Adding Analytics Events

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
- **Shared Types:** All entity types live in `lib/types.ts`. Keep them in sync with `documentation/database/master-schema.json`.

### Performance Best Practices
- **Server Actions:** Always use `fetchWithRetry` wrapper for DB calls in `app/actions/*`.
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
| **Slow queries** | `app/actions/data.ts` | Ensure SQL queries have appropriate indexes in Neon. Use `EXPLAIN ANALYZE` in Neon console. |
| **Map not rendering** | MapTiler key | Verify `NEXT_PUBLIC_MAPTILER_KEY` is set and active. Check browser console for tile fetch errors. |
| **Notifications not appearing** | Feature flag | Set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=enabled` in `.env.local`. Restart dev server. |
| **Choropleth seams** | Map style | Disable disputed boundary layers in your MapTiler style. See `documentation/map-disputed-boundaries.md`. |
| **Export button disabled** | User role | Only `admin` role can export. Update the `role` column in `public.profiles`. |
| **PostHog events missing** | Environment variables | Verify `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are set. Check that `providers.tsx` is wrapping the app. |
| **Company logos not loading** | Logo.dev token | Set `NEXT_PUBLIC_LOGO_DEV_TOKEN`. If the company isn't in Logo.dev's index, the fallback icon is expected. |
| **Financial data missing** | Yahoo Finance | The Yahoo Finance API can be rate-limited. Check server action logs for errors. |
