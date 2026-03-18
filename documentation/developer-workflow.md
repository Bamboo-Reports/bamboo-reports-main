# Developer Workflow & Contribution Guide

This guide is for developers maintaining or extending the Bamboo Reports application. It covers common tasks, coding standards, and troubleshooting steps.

## 1. Setup & Installation

### Prerequisites
- Node.js 18+
- pnpm (Recommended) or npm
- Access to the Neon DB connection string
- Access to the Supabase project credentials

### Local Environment
1.  **Clone & Install:**
    ```bash
    git clone ...
    pnpm install
    ```
2.  **Environment Variables:**
    Copy `.env.example` to `.env.local` and fill in the secrets.
    *   `DATABASE_URL`: Essential for data fetching.
    *   `NEXT_PUBLIC_SUPABASE_*`: Essential for Auth and Saved Filters.

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```

---

## 2. Common Tasks

### 2.1 Adding a New Filter
To add a new filter (e.g., "Founded Year") to the sidebar:

1.  **Update Type Definition:**
    Edit `lib/types.ts` to add the new field to the `Filters` interface.
    ```typescript
    export interface Filters {
      // ... existing
      foundedYear?: number[];
    }
    ```

2.  **Update Database Query:**
    Edit `app/actions.ts` inside `getFilteredAccounts` (or relevant function).
    ```typescript
    if (filters.foundedYear?.length) {
      query = sql`${query} AND founded_year = ANY(${filters.foundedYear})`
    }
    ```

3.  **Update UI Component:**
    Edit `components/filters/filters-sidebar.tsx`.
    -   Add a new `<AccordionItem>` for the filter.
    -   Use `EnhancedMultiSelect` or `Slider` to control the value.

### 2.2 Adding a New Chart
1.  **Create Component:**
    Create `components/charts/my-new-chart.tsx`.
    Use `recharts` (ResponsiveContainer, BarChart, etc.).

2.  **Prepare Data:**
    Create a helper in `lib/utils/chart-helpers.ts` to transform the raw data into the format required by the chart.
    ```typescript
    export function getFoundedYearStats(accounts: Account[]) {
      // Logic to aggregate data
    }
    ```

3.  **Integrate:**
    Import and place the chart in `app/page.tsx` or a specific tab file.

### 2.3 Database Schema Changes
If you modify the database schema (e.g., rename a column):

1.  **Update `documentation/database/master-schema.json`** with the new structure.
2.  **Update `documentation/schema-migration-guide.md`** to log the change.
3.  **Update `lib/types.ts`** to match the new column names.
4.  **Search & Replace** the old column name in `app/actions.ts` to ensure queries don't fail.

### 2.4 Adjusting Dashboard Panel Height (Map/Data vs Sidebar Alignment)
When changing map/data card heights, keep the bottom edge aligned with the left filters sidebar.

Use this rule:
-   Set the panel height in one place only using `--dashboard-panel-height` on the dashboard `<main>` container in `app/page.tsx`.
-   Consume the same variable in panel cards with `h-[var(--dashboard-panel-height)]` (Accounts, Centers, Prospects tabs).
-   Avoid hardcoding separate `h-[calc(100vh-...)]` values per tab because they drift out of alignment.

Current implementation:
-   `app/page.tsx`
    -   `--dashboard-panel-height: calc(100dvh-18.75rem)`
-   `components/tabs/accounts-tab.tsx`
    -   Map/Data cards use `h-[var(--dashboard-panel-height)]`
-   `components/tabs/centers-tab.tsx`
    -   Map/Data cards use `h-[var(--dashboard-panel-height)]`
-   `components/tabs/prospects-tab.tsx`
    -   Data card uses `h-[var(--dashboard-panel-height)]`

If UI alignment needs tuning:
1.  Edit only `--dashboard-panel-height` in `app/page.tsx`.
2.  Refresh Accounts/ Centers/ Prospects views and confirm the sidebar and panel bottoms end on the same line.
3.  Keep header compaction consistent (`CardHeader` `py-3`, `CardTitle` `text-base`) unless a redesign is intended.

---

## 3. Coding Standards

### Naming Conventions
-   **Database Columns:** `snake_case` (e.g., `account_hq_revenue`).
-   **TypeScript Variables/Props:** `camelCase` (e.g., `accountHqRevenue`).
-   **Files:** `kebab-case` (e.g., `account-details-dialog.tsx`).
-   **Components:** `PascalCase` (e.g., `AccountDetailsDialog`).

### Type Safety
-   **Strict Mode:** TypeScript strict mode is enabled. Avoid using `any`.
-   **Zod:** Use Zod for validating external inputs (e.g., form submissions, API parameters).

### Performance Best Practices
-   **Server Actions:** Always use `fetchWithRetry` wrapper for DB calls.
-   **Client Components:** Use `useMemo` for expensive data transformations (sorting/filtering 1000+ rows).
-   **Imports:** Use named imports.

---

## 4. Git Workflow

1.  **Branching:** Use descriptive branch names (e.g., `feature/add-map-clustering`, `fix/sidebar-overflow`).
2.  **Commits:** Use conventional commit messages if possible.
    -   `feat: add new map clustering logic`
    -   `fix: resolve overflow in sidebar`
    -   `docs: update readme`
3.  **PRs:** Ensure `npm run lint` and `npm run build` pass before merging.

---

## 5. Troubleshooting

| Issue | Check | Solution |
| :--- | :--- | :--- |
| **Styles missing** | `globals.css` | Ensure Tailwind directives are present and `tailwind.config.ts` includes the paths. |
| **Auth Loop** | Supabase Config | Check if `middleware.ts` (if present) is correctly handling session refreshing. |
| **Slow Queries** | `actions.ts` | Ensure the SQL query has appropriate indexes in Neon. Use `EXPLAIN ANALYZE` in Neon console. |
