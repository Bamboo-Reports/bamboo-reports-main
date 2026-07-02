# Project Architecture

This document describes the high-level architecture of the Bamboo Reports application, focusing on data flow, state management, the server-client boundary, and integrations.

---

## 1. Core Architecture Pattern: Server Actions & Client Components

The application uses the **Next.js App Router** with a heavy reliance on **Server Actions** for data fetching. This eliminates the need for a separate API layer (REST/GraphQL) for internal data.

### Data Flow

```
User Interaction
    → React State Update (useDashboardFilters)
    → Client-Side Filtering + Chart Aggregation (lib/dashboard/*, lib/utils/*)
    → UI Re-render (Tables, Charts, Maps, Summary Cards)
```

For operations requiring fresh Neon warehouse data (initial load, dashboard refresh, notifications):

```
Component Mount / User Action
    → Server Action (app/actions/*.ts)
    → Prisma Client Query with Retry Logic (lib/db/prisma.ts)
    → Neon PostgreSQL
    → Serialized Response
    → React State Update
    → UI Re-render
```

Supabase-backed user data (auth, profiles, saved filters, favorites, export audit rows, and Storage) stays on the Supabase client/service-role APIs so RLS/Auth/Storage behavior remains unchanged.

---

## 2. Directory Structure & Responsibilities

### 2.1 `app/` (Routes & Actions)

-   **`actions.ts`**: Central re-export point for all server action modules.
-   **`actions/data.ts`**: Core Neon warehouse fetching — accounts, centers, services, functions, tech, prospects, and aliases. Uses Prisma model reads for `accounts`/`centers` and Prisma tagged raw SQL for the linked child tables and analytical queries.
-   **`actions/financial.ts`**: Financial data queries (Yahoo Finance integration for stock data).
-   **`actions/notifications.ts`**: Notification tracking — recently updated accounts and records, read status.
-   **`actions/system.ts`**: System diagnostics and health checks.
-   **`page.tsx`**: Main dashboard entry point and UI orchestrator. Wires auth, data loading, filtering hooks, and layout composition.
-   **`providers.tsx`**: Application-level providers (PostHog analytics).
-   **`(auth)/`**: Auth route group containing `signin/` and `signup/` pages.
-   **`api/dashboard/`**: Route Handler that serves the full dashboard dataset with an in-memory SWR cache and gzip compression (see `documentation/api-caching-swr.md`).
-   **`api/exports/`**: Route Handlers for generating, listing, and re-downloading user exports.
-   **Rule:** Neon database access is isolated to `app/actions/*`, `app/api/*`, and `lib/db/prisma.ts`. Supabase Auth, RLS-backed user tables, and Storage continue to use Supabase client/service-role APIs.

### 2.2 `components/` (UI Composition)

Organized by feature domain:

| Directory | Responsibility |
|-----------|---------------|
| `auth/` | Sign-in and sign-up form components |
| `cards/` | Card component variants |
| `charts/` | Highcharts donut charts and the Technology treemap (the Recharts revenue area chart lives in `dialogs/`) |
| `dashboard/` | Summary cards with filtered vs. total counts |
| `dialogs/` | Tabbed detail views for Accounts, Centers, Prospects |
| `export/` | Excel export workflow and dialog |
| `exports/` | "My exports" dialog for re-downloading archived exports |
| `filters/` | Sidebar filter UI, multi-select controls, keyword inputs |
| `history/` | Recently viewed history dialog |
| `layout/` | Header and Footer components |
| `maps/` | MapLibre cluster map and state choropleth map |
| `notifications/` | Notification bell dropdown |
| `prospects/` | Locked prospect teaser cards for capped deployments |
| `search/` | Global search with alias-aware account matching |
| `states/` | Loading and error state fallback components |
| `tables/` | Data grid row components (AccountRow, CenterRow, etc.) |
| `tabs/` | Tab views (Accounts, Centers, Prospects, Services) |
| `ui/` | Shared design system primitives (shadcn/ui) |

Key components:
-   **`filters/filters-sidebar.tsx`**: Composes filter sections and saved-filter controls; state lives in hooks at the page level.
-   **`saved-filters-manager.tsx`**: Encapsulates all Supabase interaction for saving/loading user filter preferences.
-   **`maps/centers-choropleth-map.tsx`**: State-level choropleth with disputed boundary alias handling.

### 2.3 `hooks/` (Custom React Hooks)

| Hook | Responsibility |
|------|---------------|
| `use-auth-guard.ts` | Redirects unauthenticated users to sign-in |
| `use-dashboard-data.ts` | Orchestrates data fetching and loading state |
| `use-dashboard-filters.ts` | Complex filter state management (the largest hook, manages all filter logic, include/exclude modes, range sliders, keyword search) |
| `use-global-search.ts` | Alias-aware global account search state |
| `use-notifications.ts` | Notification state, unread counts, and read tracking |
| `use-product-tour.ts` | Guided product tour orchestration (driver.js) |
| `use-recent-items.ts` | Tracks recently viewed records for the History dialog |
| `use-saved-filters.ts` | Saved filter CRUD with Supabase |
| `use-table-column-preferences.ts` | Per-user table column visibility preferences |

### 2.4 `lib/` (Utilities & Configuration)

| Directory | Responsibility |
|-----------|---------------|
| `analytics/` | PostHog client initialization, event definitions, tracking helpers |
| `auth/` | Role-based access control (`UserRole`, `canExportData()`) |
| `config/` | Environment label, dashboard access, premium filter reveal, notification settings |
| `dashboard/` | Dashboard-specific data transformation utilities |
| `db/` | Prisma Client singleton for Neon PostgreSQL warehouse access with retry logic |
| `exports/` | Export request client and server-side ExcelJS workbook builder |
| `finance/` | Financial data transformation utilities |
| `notifications/` | Notification message formatting helpers |
| `request/` | Request metadata helpers (client IP, user-agent) for the export audit log |
| `search/` | Account search index and alias matching (`alias-utils.ts`, `index.ts`) |
| `supabase/` | Supabase client factory (singleton) |
| `tour/` | Guided product tour steps and configuration |
| `utils/` | General helpers (chart data transformers, export helpers, filter logic, formatters) |
| `validators/` | Zod schemas for runtime validation |
| `types.ts` | Shared TypeScript interfaces (Account, Center, Service, Function, Tech, Prospect, Filters) |

---

## 3. State Management Strategy

### 3.1 Filter State
The filter state is a complex object defined in `lib/types.ts` (`Filters` interface).
-   **Source of Truth:** The top-level `DashboardContent` component in `app/page.tsx`.
-   **Management:** `useDashboardFilters` hook handles all filter logic including include/exclude modes, range calculations, keyword debouncing, and filter counting.
-   **Configuration:** `lib/config/filters.ts` controls filter availability per section, including premium `Show More` behavior for Accounts and Centers.
-   **Persistence:**
    -   **Short-term:** React `useState`.
    -   **Long-term:** Saved to Supabase via `SavedFiltersManager` with `withFilterDefaults` for backward compatibility.
-   **Optimization:**
    -   **Debouncing:** Search inputs are debounced (300ms) to prevent excessive re-renders.
    -   **Memoization:** `React.memo` is used on row components (`AccountRow`, `CenterRow`, etc.) to prevent re-rendering the entire table when only filters change.
    -   **`useMemo`:** Used for expensive data transformations (sorting, filtering, chart aggregation over 1000+ rows).

### 3.2 Authentication State
Managed by Supabase Auth.
-   **Session:** Stored in HTTP-only cookies (server-side).
-   **Guard:** `useAuthGuard` hook redirects unauthenticated users.
-   **Profile:** Fetched from `public.profiles` table; provides role-based access (`viewer` / `admin`).

### 3.3 Deployment Capability State
Deployment-level packaging is config-driven.
-   **Top-level sections:** `lib/config/dashboard-access.ts` controls whether Accounts, Centers, and Prospects are accessible.
-   **Prospect packaging:** `limits.prospectsPerAccount` can cap visible prospects per account. The capped remainder is represented in the UI as locked teaser contacts only.
-   **Enforcement:** The same access config is consumed by the dashboard page, search flows, export workflow, and server-side export route.
-   **Goal:** Support client-specific packaging without branching the main dashboard implementation.

### 3.4 Notification State
Managed by `useNotifications` hook.
-   **Data source:** `audit.field_change_events` and `audit.notification_reads` tables.
-   **Feature flag:** Controlled by `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` environment variable.
-   **Grouping:** Notifications are grouped by account or table record for a clean UI.

---

## 4. Database Layer

### 4.1 Neon PostgreSQL (Data Warehouse)

We use Prisma ORM over Neon PostgreSQL only. `accounts` and `centers` are modelled in Prisma, matching `documentation/table-relationships.md`. The linked child tables (`alias`, `functions`, `services`, `tech`, `prospects`) stay on Prisma tagged raw SQL; their linkage is handled through `account_global_legal_name` and `cn_unique_key` in query logic and client-side filters. Aggregation-heavy queries and edge-case selection logic also use Prisma raw SQL for control over query structure.

```typescript
// app/actions/data.ts
const accounts = await queryWithRetry(() =>
  prisma.accountWarehouse.findMany({
    orderBy: { account_global_legal_name: "asc" },
  })
)
```

-   **Safety:** Prisma model queries and Prisma tagged raw queries keep dynamic values parameterized.
-   **Performance:** `Promise.all` in `getAllData` fetches Accounts, Centers, and Prospects concurrently.
-   **Retry Logic:** Exponential retry handling via `queryWithRetry` in `lib/db/prisma.ts`.
-   **Caching:** Server Actions themselves keep no cross-request cache and fetch fresh data. The `GET /api/dashboard` Route Handler layers an in-memory stale-while-revalidate cache (default 1-hour TTL, configurable via `DASHBOARD_CACHE_TTL_MS`) over the dashboard query. See `documentation/api-caching-swr.md`.

### 4.2 Supabase PostgreSQL (User Data)

-   **Tables:** `public.profiles`, `public.saved_filters`, `public.filter_shares`, `public.user_favorites`, `public.user_exports` (export audit log).
-   **Security:** Row-Level Security (RLS) policies ensure users can only access their own data.
-   **Client:** Singleton Supabase browser client in `lib/supabase/client.ts`; service-role client in `lib/supabase/server.ts` for trusted Storage/export operations.
-   **Boundary:** Supabase data is not accessed through Prisma in this codebase. Keeping Supabase on its own APIs preserves Auth, RLS, and Storage semantics.

### 4.3 Account Visibility (`account_visibility` / `account_visibility_note`)

Two columns on `accounts` control whether an account is included by default in dashboard counts and tables.

-   `account_visibility`: `'include'` (default) or `'exclude'`. Excluded accounts are records we keep but do not want to surface by default (for example, companies with only sales, manufacturing, or distribution presence in India, not full GCC operations).
-   `account_visibility_note`: short, human-readable reason for the exclusion. Surfaced as a chip alongside the NASSCOM chip on the accounts table row (`components/tables/account-row.tsx`) and grid card (`components/cards/account-grid-card.tsx`).

**Visibility filter behavior:** the Account Attributes sidebar includes `Account Visibility` with `ALL`, `GCCs`, and `NON-GCCs`. `GCCs` is the default and includes accounts where `account_visibility = 'include'`; `NON-GCCs` includes `account_visibility = 'exclude'`; `ALL` includes both. The selected visibility mode constrains `filteredAccounts` / `filteredCenters` / `filteredProspects`, so tables, charts, exports, and summary card numerators stay aligned. The summary card denominators always show the full universe (e.g., 2657 accounts) so the user can see "2349 visible / 2657 total". Explicit account-name search bypasses the visibility mode so a searched account can be found directly. This is implemented in `lib/dashboard/filtering.ts` (`getFilteredData`) and `app/page.tsx` (summary card props use the `*Full` totals from `DashboardSummaryMetrics`).

**Server-side totals:** `getDashboardSummaryMetrics` in `app/actions/data.ts` returns BOTH a visible universe (`totalAccountsCount`, etc.) and a full universe (`totalAccountsCountFull`, etc.) for accounts, centers, upcoming centers, prospects, and headcount. Centers and prospects join `accounts` on `account_global_legal_name` to compute the visible variants.

### 4.4 Account Aliases (`alias` table)

The `public.alias` table stores alternate names for each account (short legal name, brand name, abbreviation, flagship products, "currently known as"), linked to `accounts` by a foreign key on `account_global_legal_name` with `ON UPDATE`/`ON DELETE CASCADE`.

Alias rows power alias-aware account search: the global search (`components/search/global-search.tsx`) and the account filter autocomplete (`components/filters/account-autocomplete.tsx`) match a query against both account names and alias values, so searching for an alternate name (for example "HMH" or "HackerRank") resolves to the underlying account. Matches found through an alias surface a "Known as: <alias>" hint so the result is not confusing. Matching logic lives in `lib/search/alias-utils.ts` and `lib/search/index.ts`; the alias dataset is loaded alongside dashboard data in `app/actions/data.ts`. The migration is `documentation/sql/alias-table-migration.sql`.

---

## 5. External Integrations

### 5.1 MapLibre + Carto
-   **Cluster Map** (`components/maps/centers-map.tsx`): Client-side rendering with MapLibre GL. Supports clustering for 5000+ center points.
-   **Choropleth Map** (`components/maps/centers-choropleth-map.tsx`): State-level fills driven by center aggregation data and local Survey of India GeoJSON.
-   **Basemap:** Both views use the keyless Carto Positron style; de-facto boundary layers are hidden in favor of the local administrative overlay.

### 5.2 Logo.dev
-   Used in `components/ui/company-logo.tsx`.
-   **Mechanism:** Constructs a URL `https://img.logo.dev/{domain}?token=...`.
-   **Fallback:** Renders a colored badge with initials if the image fails to load or the company is not in the Logo.dev index.

### 5.3 Yahoo Finance
-   Used in `app/actions/financial.ts` and `lib/finance/`.
-   **Purpose:** Fetches stock prices and financial metrics for account entities with stock tickers.
-   **Integration:** Server-side only (via server actions).

### 5.4 PostHog Analytics
-   Initialized in `app/providers.tsx` and `lib/analytics/client.ts`.
-   **Event tracking:** Defined in `lib/analytics/events.ts`, executed via helpers in `lib/analytics/tracking.ts`.
-   **Events tracked:** Page views, filter interactions, export actions, tab navigation, session duration.
-   **User identification:** Tied to Supabase user ID for cross-session tracking.

### 5.5 Vercel Analytics
-   Automatic Core Web Vitals tracking via `@vercel/analytics`.
-   Zero configuration required — works automatically when deployed on Vercel.

---

## 6. Component Hierarchy

```
app/layout.tsx (Root Layout)
└── AppProviders (PostHog, Theme)
    └── app/page.tsx (Dashboard)
        └── DashboardContent
            ├── Header
            │   └── GlobalSearch, ThemeToggle, NotificationBell, UserMenu
            ├── FiltersSidebar
            │   ├── FilterSections
            │   │   ├── EnhancedMultiSelect (per filter group)
            │   │   ├── Slider (revenue, employees, years)
            │   │   └── TitleKeywordInput
            │   └── SavedFiltersManager
            ├── SummaryCards (filtered vs. total counts)
            ├── TabsContainer
            │   ├── AccountsTab
            │   │   ├── PieChartCard (charts view)
            │   │   ├── CentersMap / CentersChoroplethMap (map view)
            │   │   └── DataTable with AccountRow (data view)
            │   ├── CentersTab
            │   │   ├── CentersMap / CentersChoroplethMap (map view)
            │   │   └── DataTable with CenterRow (data view)
            │   ├── ProspectsTab
            │   │   └── DataTable with ProspectRow (data view)
            │   └── ServicesTab
            │       └── DataTable with ServiceRow (data view)
            ├── ExportDialog
            └── Detail Dialogs
                ├── AccountDetailsTabbedDialog
                ├── CenterDetailsDialog
                └── ProspectDetailsDialog
```

---

## 7. Performance Strategies

| Strategy | Implementation |
|----------|---------------|
| **Client-side filtering** | After initial data load, filtering runs locally in React state for instant UI feedback |
| **Concurrent data fetching** | `Promise.all` in `getAllData` parallelizes account, center, and prospect queries |
| **Debounced search** | 300ms delay on keyword inputs prevents excessive re-renders |
| **Row memoization** | `React.memo` on table row components prevents unnecessary re-renders |
| **Data memoization** | `useMemo` for expensive aggregations (chart data, sorted arrays) |
| **Lazy image loading** | Company logos use `loading="lazy"` for off-screen rows |
| **Pagination** | 50 items per page to keep DOM size manageable |
| **Retry with backoff** | Database queries retry 3 times with exponential backoff (1s, 2s, 4s) |
