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

For operations requiring fresh data (initial load, saved filters, notifications):

```
Component Mount / User Action
    → Server Action (app/actions/*.ts)
    → SQL Query with Retry Logic (lib/db/connection.ts)
    → Neon PostgreSQL / Supabase
    → Serialized Response
    → React State Update
    → UI Re-render
```

---

## 2. Directory Structure & Responsibilities

### 2.1 `app/` (Routes & Actions)

-   **`actions.ts`**: Central re-export point for all server action modules.
-   **`actions/data.ts`**: Core data fetching — accounts, centers, services, functions, tech, prospects. Raw SQL queries using `@neondatabase/serverless` with parameterized inputs.
-   **`actions/saved-filters.ts`**: CRUD operations for user-saved filter configurations (Supabase).
-   **`actions/financial.ts`**: Financial data queries (Yahoo Finance integration for stock data).
-   **`actions/notifications.ts`**: Notification tracking — recently updated accounts and records, read status.
-   **`actions/system.ts`**: System diagnostics and health checks.
-   **`page.tsx`**: Main dashboard entry point and UI orchestrator. Wires auth, data loading, filtering hooks, and layout composition.
-   **`providers.tsx`**: Application-level providers (PostHog analytics).
-   **`(auth)/`**: Auth route group containing `signin/` and `signup/` pages.
-   **Rule:** Database access is isolated to `app/actions/*` and `lib/db/connection.ts`. Components should never import DB drivers directly.

### 2.2 `components/` (UI Composition)

Organized by feature domain:

| Directory | Responsibility |
|-----------|---------------|
| `auth/` | Sign-in and sign-up form components |
| `cards/` | Card component variants |
| `charts/` | Recharts pie/donut charts, Highcharts treemaps |
| `dashboard/` | Summary cards with filtered vs. total counts |
| `dialogs/` | Tabbed detail views for Accounts, Centers, Prospects |
| `export/` | Excel export workflow and dialog |
| `filters/` | Sidebar filter UI, multi-select controls, keyword inputs |
| `layout/` | Header and Footer components |
| `maps/` | MapLibre cluster map and state choropleth map |
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
| `use-dashboard-filters.ts` | Complex filter state management (the largest hook — manages all filter logic, include/exclude modes, range sliders, keyword search) |
| `use-notifications.ts` | Notification state, unread counts, and read tracking |
| `use-range-filter.ts` | Reusable range slider logic with logarithmic scaling |
| `use-recently-updated-accounts.ts` | Tracks recently changed account records |
| `use-recently-updated-table-records.ts` | Tracks recently changed records across all tables |
| `use-saved-filters.ts` | Saved filter CRUD with Supabase |

### 2.4 `lib/` (Utilities & Configuration)

| Directory | Responsibility |
|-----------|---------------|
| `analytics/` | PostHog client initialization, event definitions, tracking helpers |
| `auth/` | Role-based access control (`UserRole`, `canExportData()`) |
| `config/` | Environment label, MapTiler configuration, notification settings |
| `dashboard/` | Dashboard-specific data transformation utilities |
| `db/` | Neon PostgreSQL connection client with retry logic |
| `finance/` | Financial data transformation utilities |
| `supabase/` | Supabase client factory (singleton) |
| `utils/` | General helpers — chart data transformers, export helpers, filter logic, formatters |
| `validators/` | Zod schemas for runtime validation |
| `types.ts` | Shared TypeScript interfaces (Account, Center, Service, Function, Tech, Prospect, Filters) |

---

## 3. State Management Strategy

### 3.1 Filter State
The filter state is a complex object defined in `lib/types.ts` (`Filters` interface).
-   **Source of Truth:** The top-level `DashboardContent` component in `app/page.tsx`.
-   **Management:** `useDashboardFilters` hook handles all filter logic including include/exclude modes, range calculations, keyword debouncing, and filter counting.
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

### 3.3 Notification State
Managed by `useNotifications` hook.
-   **Data source:** `audit.field_change_events` and `audit.notification_reads` tables.
-   **Feature flag:** Controlled by `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` environment variable.
-   **Grouping:** Notifications are grouped by account or table record for a clean UI.

---

## 4. Database Layer

### 4.1 Neon PostgreSQL (Data Warehouse)

We use raw SQL (via template literals) instead of an ORM for maximum control over performance and query structure.

```typescript
// app/actions/data.ts
const results = await fetchWithRetry(() => sql`
  SELECT * FROM accounts
  WHERE account_region = ${region}
  ORDER BY revenue DESC
  LIMIT 50
`)
```

-   **Safety:** Parameterized queries prevent SQL injection.
-   **Performance:** `Promise.all` in `getAllData` fetches Accounts, Centers, and Prospects concurrently.
-   **Retry Logic:** 3 retries with exponential backoff (1s, 2s, 4s) via `fetchWithRetry` in `lib/db/connection.ts`.
-   **Caching:** No custom in-memory cache. Server actions always fetch fresh data (`no-store`).

### 4.2 Supabase PostgreSQL (User Data)

-   **Tables:** `public.profiles`, `public.saved_filters`
-   **Security:** Row-Level Security (RLS) policies ensure users can only access their own data.
-   **Client:** Singleton Supabase client in `lib/supabase/client.ts`.

---

## 5. External Integrations

### 5.1 MapTiler + MapLibre
-   **Cluster Map** (`components/maps/centers-map.tsx`): Client-side rendering with MapLibre GL. Supports clustering for 5000+ center points.
-   **Choropleth Map** (`components/maps/centers-choropleth-map.tsx`): State-level fills driven by center aggregation data. Supports disputed boundary alias rules configurable via `NEXT_PUBLIC_MAP_VIEWPOINT_ISO2`.
-   **Map Styles:** Configurable per mode (state/city) via environment variables.

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
            │   └── ThemeToggle, NotificationBell, UserMenu
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
