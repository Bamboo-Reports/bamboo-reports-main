# Project Architecture

This document describes the high-level architecture of the Bamboo Reports application, focusing on data flow, state management, the server-client boundary, and integrations.

---

## 1. Core Architecture Pattern: Route Handlers & Client Components

The application uses the **Next.js App Router**. Warehouse reads go through authenticated, rate-limited **Route Handlers** under `app/api/**`; the only remaining **Server Action** is `app/actions/notifications.ts`.

### Data Flow

Since #249 (the legacy full-payload route was retired on 2026-09-05) filters are sent to server read endpoints, translated to parameterized SQL, and only paginated/aggregated slices reach the browser:

```
User Interaction
    → React State Update (useDashboardFilters)
    → useServerDashboardData → /api/dashboard/{summary,facets,charts}, /api/{entity}/query
    → SQL filter translation (lib/dashboard/filtering-sql.ts) → queryWarehouse (lib/db/warehouse.ts) → Neon PostgreSQL
    → Paginated/aggregated response (cached: L1 + Upstash Redis L2)
    → UI Re-render (Tables, Charts, Maps, Summary Cards)
```

See [Server-Mode Dashboard](backend/server-dashboard-mode.md). `lib/dashboard/filtering.ts` is the reference client-side engine kept for the SQL parity tests and a few client helpers; it no longer drives the dashboard.

Notifications (unread counts, recently updated accounts and records) use the Server Action path:

```
Component Mount / User Action
    → Server Action (app/actions/notifications.ts)
    → Prisma raw SQL with retry (lib/db/prisma.ts, queryWithRetry)
    → Neon PostgreSQL (audit schema)
    → React State Update → UI Re-render
```

Supabase-backed user data (auth, profiles, saved filters, favorites, account lists, export audit rows, and Storage) stays on the Supabase client/service-role APIs so RLS/Auth/Storage behavior remains unchanged.

---

## 2. Directory Structure & Responsibilities

### 2.1 `app/` (Routes & Actions)

-   **`api/**`**: Warehouse reads (Route Handlers): `dashboard/{summary,facets,charts}`, `<entity>/query`, `centers/map`, `accounts/[name]/related`, `search`, `accounts/autocomplete`, built on `lib/dashboard/filtering-sql.ts` and `lib/db/warehouse.ts`. See [Server-Mode Dashboard](backend/server-dashboard-mode.md).
-   **`actions/notifications.ts`**: Notification tracking (recently updated accounts and records, read status). The only Server Action file.
-   **`page.tsx`**: Main dashboard entry point and UI orchestrator. Wires auth, data loading, filtering hooks, and layout composition.
-   **`providers.tsx`**: Application-level providers: PostHog init and page views, `NotificationProvider`, `AccountListsProvider`.
-   **`(auth)/`**: Auth route group containing `signin/`, `signup/`, `forgot-password/` and `reset-password/` pages.
-   **`api/dashboard/{summary,facets,charts}/`**, **`api/{accounts,centers,prospects}/query/`**, **`api/search/`**, **`api/accounts/autocomplete/`**, **`api/centers/map/`**: Server-mode read endpoints (#249) that serve aggregated and paginated slices with filters translated to SQL (see `documentation/backend/server-dashboard-mode.md`).
-   **`api/centers/[key]/`**, **`api/prospects/[id]/`**: Single-record lookups used by the detail dialogs.
-   **`api/prospects/[id]/engagements/`**: A prospect's campaign touchpoints from the `subscribers` table (matched by email), oldest first, for the activity timeline.
-   **`api/accounts/match/`**: Resolves an uploaded account list to warehouse account names (exact, alias, suffix-insensitive, fuzzy candidates). See [Account Lists](backend/account-lists.md).
-   **`api/financials/`**: Authed, rate-limited proxy for Yahoo Finance data.
-   **`api/exports/`**: Route Handlers for generating (`generate/`), listing, and re-downloading (`[id]/download/`) user exports.
-   **Rule:** Neon database access is isolated to `app/actions/*`, `app/api/*`, `lib/db/warehouse.ts` and `lib/db/prisma.ts` (plus the server-only `lib/` modules they call). Supabase Auth, RLS-backed user tables, and Storage continue to use Supabase client/service-role APIs.

### 2.2 `components/` (UI Composition)

Organized by feature domain:

| Directory | Responsibility |
|-----------|---------------|
| `auth/` | `AuthShell`, the card frame shared by the sign-in, sign-up and password pages under `app/(auth)/` |
| `brand/` | `BrandMark` (inline animated logo) and `BrandPage` (frame for every screen outside the dashboard shell) |
| `cards/` | Grid-view cards for Accounts, Centers, Prospects |
| `charts/` | Highcharts donut charts and the Technology treemap (the Recharts revenue area chart lives in `dialogs/`) |
| `dashboard/` | Summary cards with filtered vs. total counts |
| `dialogs/` | Tabbed detail views for Accounts, Centers, Prospects (including the prospect campaign activity timeline and the AI services card in the center dialog), plus the History (recently viewed) and Favorites dialogs |
| `exports/` | Excel export dialog and the "My exports" dialog for re-downloading archived exports |
| `filters/` | Sidebar filter UI, multi-select controls, keyword inputs, saved filters manager, account list picker, upload and manage dialogs |
| `layout/` | Header, global search with alias-aware account matching, notification bell dropdown |
| `maps/` | MapLibre cluster map and state choropleth map |
| `states/` | Full-page loading skeleton (`LoadingState`), dashboard load error (`ErrorState`), in-place empty states, maintenance screen |
| `tables/` | Data grid row components (AccountRow, CenterRow, etc.) |
| `tabs/` | Tab views (Accounts, Centers, Prospects) |
| `ui/` | Shared design system primitives (shadcn/ui) plus skeleton primitives (`skeleton.tsx`, `chart-wave-skeleton.tsx`, `data-skeletons.tsx`) and app-specific bits such as `company-logo.tsx` and `engaged-badge.tsx` |

Icons come from Remix Icon (`@remixicon/react`, `Ri*Line` components) throughout.

Key components:
-   **`filters/filters-sidebar.tsx`**: Composes filter sections and saved-filter controls; state lives in hooks at the page level.
-   **`filters/saved-filters-manager.tsx`**: Saved filter UI (save, load, share) on top of `use-saved-filters.ts`.
-   **`filters/account-list-picker.tsx`**, **`account-list-upload-dialog.tsx`**, **`account-lists-dialog.tsx`**: Apply (include/exclude), upload and manage account lists; see [Account Lists](backend/account-lists.md).
-   **`dialogs/prospect-engagement-timeline.tsx`**: Campaign activity timeline in the prospect dialog; engaged prospects carry `ui/engaged-badge.tsx` in rows and cards.
-   **`maps/centers-choropleth-map.tsx`**: State-level choropleth with disputed boundary alias handling.
-   **`brand/brand-page.tsx`**: One frame for the auth, load error, 404, global error and maintenance screens, so they share the dashboard's gradient and brand lockup. See [Standalone Screens](frontend/standalone-screens.md).
-   **`states/loading-state.tsx`**: A ghost of the dashboard shell (header, rail, five summary cards, chart card) shown before the first payload, so data fills into the same structure instead of swapping screens.

### 2.3 `hooks/` (Custom React Hooks)

| Hook | Responsibility |
|------|---------------|
| `use-auth-guard.ts` | Redirects unauthenticated users to sign-in |
| `use-copy-to-clipboard.ts` | Copy-to-clipboard with auto-reset "copied" state |
| `use-dashboard-filters.ts` | Complex filter state management (the largest hook, manages all filter logic, include/exclude modes, range sliders, keyword search) |
| `use-favorites.ts` | Favorites CRUD and toggle state for accounts/centers/prospects (see [Favorites & Filter Sharing](backend/favorites-and-filter-sharing.md)) |
| `use-global-search.ts` | Alias-aware global account search state |
| `use-notifications.ts` | Notification state, unread counts, and read tracking |
| `use-product-tour.ts` | Guided product tour orchestration (driver.js, see [Product Tour](frontend/product-tour.md)) |
| `use-recent-items.ts` | Tracks recently viewed records for the History dialog |
| `use-row-selection.ts` | Generic multi-row selection state |
| `use-saved-filters.ts` | Saved filter CRUD with Supabase |
| `use-server-dashboard-data.ts` | Server-mode data orchestration: fetches summary/facets/charts, map and paginated entity slices with debounce, a client cache and loading state (see [Server-Mode Dashboard](backend/server-dashboard-mode.md)) |
| `use-table-column-preferences.ts` | Per-user table column visibility preferences |
| `use-table-row-selection.ts` | Wires `use-row-selection.ts` into a specific data table |
| `use-tour-persistence.ts` | Tour completion tracking (localStorage + Supabase) |

### 2.4 `contexts/` (Shared Client State)

| Context | Responsibility |
|---------|---------------|
| `account-lists-context.tsx` | Owner-scoped and shared account lists (Supabase `account_lists`, `account_list_shares`), one provider so the sidebar picker, upload dialog and manage dialog stay in sync |
| `notification-context.tsx` | Notification state shared between the header bell and the recently-updated dots |

### 2.5 `lib/` (Utilities & Configuration)

| Directory | Responsibility |
|-----------|---------------|
| `accounts/` | Account list parsing (`account-list-parser.ts`), list model and expansion into the exact-name filter (`account-lists.ts`), and name matching for uploads (`account-match.ts`) |
| `analytics/` | PostHog client initialization, event definitions, tracking helpers, filter metadata map |
| `auth/` | Role-based access control and server-side token verification (see [RBAC & Auth Guards](backend/rbac-and-auth-guards.md)) |
| `cache/` | Two-tier response cache: in-process L1 with residency cap + optional Upstash Redis L2 (see [Caching and Rate Limiting](backend/caching-and-rate-limiting.md)) |
| `config/` | Environment label, dashboard access, filter config and premium filter reveal, notification settings |
| `dashboard/` | Server-mode SQL builders (`filtering-sql.ts`), API client, request normalization, column projections, defaults, prospect engagement helpers (`engagements.ts`) and the reference client engine (`filtering.ts`) |
| `db/` | `warehouse.ts` (Neon HTTP driver, used by the read endpoints) and `prisma.ts` (Prisma Client singleton with retry, used by notifications and the export builder) |
| `exports/` | Export request client and server-side ExcelJS workbook builder |
| `finance/` | Financial data transformation utilities |
| `maps/` | Carto basemap style helpers and boundary handling |
| `notifications/` | Notification message formatting helpers |
| `rate-limit/` | Per-user rate limiting for data endpoints; non-production environments use their own Redis counters (see [Caching and Rate Limiting](backend/caching-and-rate-limiting.md)) |
| `reports/` | Downloadable summary PDF: data model (`summary-report.ts`) and jsPDF renderer (`summary-report-pdf.ts`) |
| `request/` | Request metadata helpers (client IP, user-agent) for the export audit log |
| `search/` | Account search index and alias matching (`alias-utils.ts`, `index.ts`) |
| `supabase/` | Supabase browser client (singleton) and service-role server client |
| `tour/` | Guided product tour steps and configuration |
| `utils/` | General helpers (chart data transformers, export helpers, filter logic, formatters) |
| `validators/` | Zod schemas for runtime validation |
| `logger.ts` | Structured server-side logger used by route handlers |
| `types.ts` | Shared TypeScript interfaces (Account, Center, Service, Function, Tech, Prospect, ProspectEngagement, Alias, Filters) |

---

## 3. State Management Strategy

### 3.1 Filter State
The filter state is a complex object defined in `lib/types.ts` (`Filters` interface).
-   **Source of Truth:** The top-level `DashboardContent` component in `app/page.tsx`.
-   **Management:** `useDashboardFilters` hook handles all filter logic including include/exclude modes, range calculations, keyword debouncing, and filter counting.
-   **Configuration:** `lib/config/filters.ts` controls filter availability per section, including premium `Show More` behavior for Accounts and Centers.
-   **Persistence:**
    -   **Short-term:** React `useState`.
    -   **Long-term:** Saved to Supabase via `SavedFiltersManager` / `use-saved-filters.ts`, with `withFilterDefaults` (`lib/dashboard/filter-summary.ts`) for backward compatibility.
-   **Account lists:** `accountListValues` holds selected list ids; on the client `withAccountLists` expands them into the exact-name filter `accountNameValues`, so the server only ever sees account names. See [Account Lists](backend/account-lists.md).
-   **Server normalization:** `lib/dashboard/filters-request.ts` coerces the posted filter object (known keys only) and applies config/access sanitization before SQL translation.
-   **Optimization:**
    -   **Debouncing:** `useServerDashboardData` debounces filter changes (350ms) unless the target state is already cached; global search is debounced too.
    -   **Memoization:** `React.memo` is used on row components (`AccountRow`, `CenterRow`, etc.) to prevent re-rendering the entire table when only filters change.

### 3.2 Authentication State
Managed by Supabase Auth.
-   **Session:** Held browser-side by `@supabase/supabase-js`, in `localStorage` ("remember me") or `sessionStorage`. Route handlers receive the access token as a Bearer header and verify it in `lib/auth/server.ts`.
-   **Guard:** `useAuthGuard` hook redirects unauthenticated users.
-   **Profile:** Fetched from `public.profiles` table; provides role-based access (`viewer` / `admin`).

### 3.3 Deployment Capability State
Deployment-level packaging is config-driven.
-   **Top-level sections:** `lib/config/dashboard-access.ts` controls whether Accounts, Centers, and Prospects are accessible.
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

Dashboard reads use the Neon HTTP driver (`@neondatabase/serverless`) through `queryWarehouse` in `lib/db/warehouse.ts`, because the filter SQL binds array parameters (`= any($n::text[])`). Prisma (`lib/db/prisma.ts`, `accounts` and `centers` modelled in `prisma/schema.prisma`) remains for the notifications Server Action and parts of the export builder. Child tables (`alias`, `functions`, `services`, `tech`, `prospects`, `subscribers`) are linked through `account_global_legal_name` and `cn_unique_key` in the SQL builders; `subscribers` links to prospects by email.

```typescript
// lib/dashboard/filtering-sql.ts builds the SQL; lib/db/warehouse.ts runs it
const rows = await queryWarehouse(buildEntityAggregateQuery("accounts", filters, access, "count(*)::int as total"))
```

-   **Safety:** every user-supplied value enters the SQL as a bound parameter; column lists and grouping expressions are code-controlled.
-   **Performance:** aggregates that share a filter state run as one statement (facets, charts, map); a table page carries its total in the same statement. The range clause compares raw columns against bigint bounds so the planner keeps its statistics (see the `rangeClause` comment).
-   **Caching:** the shared two-tier cache (`lib/cache/memory.ts`), 8-day TTL, purged by the ETL after each import. See [Caching and Rate Limiting](backend/caching-and-rate-limiting.md).

### 4.2 Supabase PostgreSQL (User Data)

-   **Tables:** `public.profiles`, `public.saved_filters`, `public.filter_shares`, `public.user_favorites`, `public.account_lists`, `public.account_list_shares`, `public.user_exports` (export audit log).
-   **Security:** Row-Level Security (RLS) policies ensure users can only access their own data.
-   **Client:** Singleton Supabase browser client in `lib/supabase/client.ts`; service-role client in `lib/supabase/server.ts` for trusted Storage/export operations.
-   **Boundary:** Supabase data is not accessed through Prisma in this codebase. Keeping Supabase on its own APIs preserves Auth, RLS, and Storage semantics.

### 4.3 Account Visibility (`account_visibility` / `account_visibility_note`)

Two columns on `accounts` control whether an account is included by default in dashboard counts and tables.

-   `account_visibility`: `'include'` (default) or `'exclude'`. Excluded accounts are records we keep but do not want to surface by default (for example, companies with only sales, manufacturing, or distribution presence in India, not full GCC operations).
-   `account_visibility_note`: short, human-readable reason for the exclusion. Surfaced as a chip alongside the NASSCOM chip on the accounts table row (`components/tables/account-row.tsx`) and grid card (`components/cards/account-grid-card.tsx`).

**Visibility filter behavior:** the Account Attributes sidebar includes `Account Visibility` with `ALL`, `GCCs`, and `NON-GCCs`. `GCCs` is the default and includes accounts where `account_visibility = 'include'`; `NON-GCCs` includes `account_visibility = 'exclude'`; `ALL` includes both. The selected visibility mode constrains the filtered accounts, centers and prospects, so tables, charts, exports, and summary card numerators stay aligned. The summary card denominators always show the full universe (e.g., 2657 accounts) so the user can see "2349 visible / 2657 total". Explicit account-name search bypasses the visibility mode so a searched account can be found directly. This is implemented in `lib/dashboard/filtering-sql.ts` (`visibilityClause`, mirrored by `lib/dashboard/filtering.ts` for the parity tests) and `POST /api/dashboard/summary`, which returns both the filtered counts (numerators) and the full-universe totals (denominators).

### 4.4 Account Aliases (`alias` table)

The `public.alias` table stores alternate names for each account (short legal name, brand name, abbreviation, flagship products, "currently known as"), linked to `accounts` by a foreign key on `account_global_legal_name` with `ON UPDATE`/`ON DELETE CASCADE`.

Alias rows power alias-aware account search: the global search (`components/layout/global-search.tsx`) and the account filter autocomplete (`components/filters/account-autocomplete.tsx`) match a query against both account names and alias values, so searching for an alternate name (for example "HMH" or "HackerRank") resolves to the underlying account. Matches found through an alias surface a "Known as: <alias>" hint so the result is not confusing. Matching logic lives in `lib/search/alias-utils.ts` and `lib/search/index.ts`; alias matches are served by `GET /api/accounts/autocomplete` and `GET /api/search` (`lib/search/search-sql.ts`). The migration is `documentation/backend/sql/alias-table-migration.sql`.

---

## 5. External Integrations

### 5.1 MapLibre + Carto
-   **Cluster Map** (`components/maps/centers-map.tsx`): Client-side rendering with MapLibre GL. Supports clustering for 5000+ center points.
-   **Choropleth Map** (`components/maps/centers-choropleth-map.tsx`): State-level fills driven by center aggregation data and local Survey of India GeoJSON.
-   **Basemap:** Both views use the keyless Carto Positron style; de-facto boundary layers are hidden in favor of the local administrative overlay.

### 5.2 Brandfetch
-   Used in `components/ui/company-logo.tsx`.
-   **Mechanism:** Constructs a `https://cdn.brandfetch.io/{domain}/...` URL from the account or center website domain, keyed by `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`.
-   **Fallback:** Renders a monogram badge if the image fails to load or no client ID is configured. See [Logo Integration](frontend/logo-integration.md).

### 5.3 Yahoo Finance
-   Used in `app/api/financials/route.ts` and `lib/finance/`.
-   **Purpose:** Fetches stock prices and financial metrics for account entities with stock tickers.
-   **Integration:** Server-side only (via the authed, rate-limited `/api/financials` route).

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
└── AppProviders (PostHog, NotificationProvider, AccountListsProvider) + ThemeProvider (light by default)
    ├── MaintenancePage (only when NEXT_PUBLIC_MAINTENANCE_MODE=true; replaces everything below)
    └── app/page.tsx (Dashboard)
        ├── LoadingState (ghost of the shell, before the first payload)
        ├── ErrorState (when the summary request fails)
        └── DashboardContent
            ├── Header
            │   └── NotificationDropdown, profile menu (theme switcher, exports, history, favorites, tour)
            ├── GlobalSearch
            ├── FiltersSidebar
            │   ├── FilterSections
            │   │   ├── EnhancedMultiSelect (per filter group)
            │   │   ├── AccountAutocomplete, AccountListPicker
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
            │   │   ├── PieChartCard (charts view)
            │   │   ├── CentersMap / CentersChoroplethMap (map view)
            │   │   └── DataTable with CenterRow (data view)
            │   └── ProspectsTab
            │       ├── PieChartCard (charts view)
            │       └── DataTable with ProspectRow (data view)
            ├── ExportDialog, ExportsDialog
            ├── HistoryDialog, FavoritesDialog
            └── Detail Dialogs
                ├── AccountDetailsTabbedDialog
                ├── CenterDetailsDialog
                └── ProspectDetailsDialog (with ProspectEngagementTimeline)
```

---

## 7. Performance Strategies

| Strategy | Implementation |
|----------|---------------|
| **Server-side filtering** | Filters are translated to SQL; only paginated rows and aggregates reach the browser |
| **Statement merging** | Facets, charts and map aggregates for one filter state run as one statement each; a table page carries its total |
| **Response cache** | L1 in-memory + Upstash Redis L2, keyed on canonical filter state, purged by the ETL |
| **Debounced filter changes** | 350ms debounce in `useServerDashboardData`, skipped when the target state is cached client-side |
| **Row memoization** | `React.memo` on table row components prevents unnecessary re-renders |
| **Lazy image loading** | Company logos use `loading="lazy"` for off-screen rows |
| **Lazy heavy libraries** | Highcharts modules and jsPDF are imported dynamically |
| **Pagination** | 51 items per page (`itemsPerPage` in `app/page.tsx`) |
| **Retry with backoff** | Prisma queries (`queryWithRetry`) retry with exponential backoff (500ms base) |
