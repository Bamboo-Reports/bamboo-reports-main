# Bamboo Reports By ResearchNXT

A modern Business Intelligence dashboard built with Next.js App Router, React, and TypeScript. The app delivers account, center, service, and prospect intelligence through rich filtering, data visualization, geospatial analytics, and export workflows.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=0B0B0B)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20.9+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=0B0B0B)](https://supabase.com)
[![Neon](https://img.shields.io/badge/DB-Neon_PostgreSQL-00E699?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![PostHog](https://img.shields.io/badge/Analytics-PostHog-1D4AFF?style=for-the-badge&logo=posthog&logoColor=white)](https://posthog.com/)
[![MapLibre](https://img.shields.io/badge/Maps-MapLibre_GL-396CB2?style=for-the-badge&logo=maplibre&logoColor=white)](https://maplibre.org/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-C62828?style=for-the-badge)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Data Flow](#architecture--data-flow)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication & Authorization](#authentication--authorization)
- [Database & Schema](#database--schema)
- [Analytics & Monitoring](#analytics--monitoring)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Documentation Reference](#documentation-reference)

---

## Overview

Bamboo Reports provides a unified view of business entities (**Accounts**, **Centers**, **Services**, **Functions**, **Tech**, and **Prospects**). The dashboard combines high-performance data grids with geospatial analytics and charting to empower decision-makers.

### Core Value Proposition
- **High Signal-to-Noise:** Designed for rapid filtering and drilling down into large datasets.
- **Geospatial Intelligence:** Visualize delivery center density with clustered markers and state-level choropleth maps.
- **Persistence:** Save complex filter configurations to the cloud (Supabase) for recurring reporting tasks.
- **Exportability:** Generate boardroom-ready Excel reports with multi-sheet support and company logos.
- **Real-Time Notifications:** Track recently updated accounts and table records with an in-app notification system.

---

## Key Features

### Dashboard and Insights
- **Smart Summary Cards:** Real-time filtered vs. total counts per entity.
- **Interactive Charts:** Highcharts donut charts and a technology treemap for categorical breakdowns (Country, Industry, Revenue, Headcount, Technology), plus a Recharts revenue trend chart in the Account details dialog.
- **Tabbed Navigation:** Seamless switching between Accounts, Centers, Prospects, and Services contexts.
- **Deployment-Level Access Control:** Accounts, Centers, and Prospects can be enabled or disabled per deployment via `lib/config/dashboard-access.ts`.
- **Geospatial Analytics:**
  - MapTiler (MapLibre) cluster map optimized for 5000+ center points.
  - State-level choropleth map with disputed boundary handling (configurable per geopolitical viewpoint).

### Advanced Filtering Engine
- **Multi-Select Filters:** Country, Region, Industry, Category, Nature, Technology, Functions, and more.
- **Account Visibility Filter:** `ALL` / `GCCs` / `NON-GCCs` toggle (default `GCCs`) constrains tables, charts, and exports to the chosen account set, while summary cards still report the full universe.
- **Alias-Aware Account Search:** Global search and the account filter autocomplete match accounts by alternate names (short legal name, brand, abbreviation, flagship products, "currently known as") and show a "Known as" hint on alias matches.
- **Precision Slicing:** "Include" vs. "Exclude" toggle per filter group.
- **Range Sliders:** Revenue, Employee count, and Years in India sliders with logarithmic scaling.
- **Premium Filter Reveal:** Accounts and Centers support config-driven `Show More` premium filters via `lib/config/filters.ts`.
- **Saved Filters:** Persist complex filter sets to Supabase with Row-Level Security isolation.
- **Debounced Search:** 300ms debounce on keyword inputs to optimize performance.
- **Active Filter Count:** Visual badge indicator showing the number of applied filters.

### Data Management
- **Paginated Tables:** 50 items per page, optimized for performance with `React.memo`.
- **Row-Level Details:** Comprehensive tabbed dialog views for Accounts, Centers, and Prospects.
- **Type Safety:** Shared TypeScript definitions ensuring consistency from database to UI.

### Export and Integrations
- **Server-Side `.xlsx` Exports:** ExcelJS builds multi-sheet workbooks on the server against a full-schema `SELECT *`, so exports include every database column regardless of what the dashboard renders.
- **Filter-Aware:** The client sends account / center identifier lists so filtered exports only include matching rows; unfiltered exports pull the full tables.
- **Audit Log + Re-Download:** Every export is archived to a private Supabase Storage bucket and logged in `public.user_exports` with IP, user-agent, filters snapshot, and row counts. Users re-download past exports from the **My exports** dialog via short-lived signed URLs.
- **Logo Integration:** Automated company logo fetching via Logo.dev API with fallback initials.
- **Financial Data:** Stock information and financial metrics via Yahoo Finance integration.

> **Details:** See [User Exports & Audit Log](documentation/user-exports.md) for the architecture, setup steps, and troubleshooting.

### Notifications
- **Recently Updated Accounts:** Tracks account-level changes with grouped notifications.
- **Recently Updated Records:** Table-level update summaries across all entities.
- **Unread Count Badge:** Bell icon with visual count indicator.
- **Feature Flag:** Toggle via `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` environment variable.

---

## Architecture & Data Flow

The application follows a **Server-First** data architecture with **Client-Side** interactivity.

```mermaid
graph TD
    Client[Client Browser] <-->|Next.js Server Actions| AppServer[Next.js App Server]

    subgraph Data Layer
        AppServer -->|Read-Only SQL| Neon["Neon PostgreSQL<br/>(Data Warehouse)"]
        AppServer -->|Auth & User Data| Supabase["Supabase<br/>(Auth, Profiles, Saved Filters)"]
        AppServer -->|Financial Data| YahooFinance["Yahoo Finance API"]
    end

    subgraph External APIs
        Client -->|Map Tiles| MapTiler[MapTiler Maps API]
        Client -->|Company Logos| LogoDev[Logo.dev API]
    end

    subgraph Analytics
        Client -->|Event Tracking| PostHog[PostHog Analytics]
        Client -->|Page Analytics| Vercel[Vercel Analytics]
    end
```

### Data Fetching Strategy
1. **Initial Load:** The client fetches the full dashboard dataset from the `GET /api/dashboard` Route Handler, which wraps the underlying Server Action with an in-memory SWR cache and gzip compression.
2. **Filtering:** User actions update React state; client-side filtering and chart aggregation run locally for responsiveness.
3. **Server Actions:** Modular action files (`app/actions/data.ts`, `app/actions/saved-filters.ts`, `app/actions/financial.ts`, `app/actions/notifications.ts`, `app/actions/system.ts`) handle database communication.
4. **Runtime Behavior:** Server Actions keep no cross-request cache and fetch fresh data with retry logic (3 retries, exponential backoff). The `/api/dashboard` Route Handler adds an in-memory stale-while-revalidate cache on top. See [API Caching](documentation/api-caching-swr.md).

---

## Tech Stack

For a comprehensive breakdown of every technology used in this project, see the **[Tech Stack Reference](documentation/tech-stack.md)**.

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2.x | App Router, Server Actions, Route Handlers, SSR |
| **React** | 19.2.x | Component Library, Hooks |
| **TypeScript** | 5.x | Strict Type Safety |

### UI and Styling
| Technology | Purpose |
|------------|---------|
| **Tailwind CSS 3.4** | Utility-first styling with custom animations |
| **shadcn/ui** | Accessible component primitives (Radix UI) |
| **Lucide React** | Consistent iconography |
| **next-themes** | Dark/Light mode support |
| **DM Sans** | Primary typeface (Google Fonts, variable) |

### Data Visualization
| Technology | Purpose |
|------------|---------|
| **Highcharts** | Donut charts for categorical breakdowns and the Technology treemap |
| **Recharts** | Revenue trend area chart in the Account details dialog |
| **MapLibre GL + MapTiler** | Cluster maps and state choropleth |

### Backend and Data
| Technology | Purpose |
|------------|---------|
| **Neon PostgreSQL** | Primary BI data warehouse (serverless, read-only) |
| **Supabase** | Authentication, user profiles, saved filters |
| **Yahoo Finance 2** | Stock and financial data integration |
| **ExcelJS** | Native `.xlsx` report generation |
| **Zod** | Schema validation for forms and inputs |

### Analytics and Monitoring
| Technology | Purpose |
|------------|---------|
| **PostHog** | Product analytics and event tracking |
| **Vercel Analytics** | Page performance monitoring |

---

## Project Structure

```
bamboo-reports-nextjs/
├── app/                            # Next.js App Router
│   ├── (auth)/                     # Auth route group (signin, signup)
│   ├── actions/                    # Modular Server Actions
│   │   ├── data.ts                 # Core data fetching (accounts, centers, etc.)
│   │   ├── saved-filters.ts        # Saved filter CRUD operations
│   │   ├── financial.ts            # Financial data queries
│   │   ├── notifications.ts        # Notification logic
│   │   └── system.ts               # System diagnostics
│   ├── api/                        # Route Handlers
│   │   ├── dashboard/              # SWR-cached dashboard dataset endpoint
│   │   └── exports/                # Export generation, listing, and re-download
│   ├── actions.ts                  # Central server action re-exports
│   ├── layout.tsx                  # Root layout with providers
│   ├── page.tsx                    # Main dashboard entry point
│   └── providers.tsx               # Analytics providers (PostHog)
│
├── components/                     # React Components
│   ├── auth/                       # Authentication UI (signin/signup forms)
│   ├── cards/                      # Card component variants
│   ├── charts/                     # Recharts + Highcharts visualizations
│   ├── dashboard/                  # Summary cards and hero stats
│   ├── dialogs/                    # Detail views (Account, Center, Prospect)
│   ├── export/                     # Excel export workflow
│   ├── exports/                    # My exports dialog (audit log re-download)
│   ├── filters/                    # Sidebar filter UI and controls
│   ├── history/                    # Recently viewed history dialog
│   ├── layout/                     # Header and Footer
│   ├── maps/                       # MapLibre cluster + choropleth maps
│   ├── notifications/              # Notification bell dropdown
│   ├── prospects/                  # Locked prospect teaser cards
│   ├── search/                     # Global search with alias-aware matching
│   ├── states/                     # Loading and error state components
│   ├── tables/                     # Data grid row components
│   ├── tabs/                       # Tab views (Accounts, Centers, etc.)
│   └── ui/                         # Shared design system (shadcn/ui)
│
├── hooks/                          # Custom React Hooks
│   ├── use-auth-guard.ts           # Authentication guard
│   ├── use-dashboard-data.ts       # Data fetching and loading state
│   ├── use-dashboard-filters.ts    # Complex filter state management
│   ├── use-global-search.ts        # Alias-aware global search
│   ├── use-notifications.ts        # Notification tracking
│   ├── use-product-tour.ts         # Guided product tour
│   ├── use-range-filter.ts         # Range slider logic
│   ├── use-recent-items.ts         # Recently viewed history tracking
│   ├── use-saved-filters.ts        # Saved filter persistence
│   └── use-table-column-preferences.ts  # Table column visibility prefs
│
├── lib/                            # Utilities & Configuration
│   ├── analytics/                  # PostHog client, events, tracking
│   ├── auth/                       # Role-based access control
│   ├── config/                     # Environment, dashboard access, filters, MapTiler, notifications
│   ├── dashboard/                  # Dashboard utility functions
│   ├── db/                         # Neon PostgreSQL client + retry logic
│   ├── exports/                    # Export request client + server-side workbook builder
│   ├── finance/                    # Financial data utilities
│   ├── notifications/              # Notification formatting helpers
│   ├── request/                    # Request metadata helpers (IP, user-agent)
│   ├── search/                     # Account search index + alias matching
│   ├── supabase/                   # Supabase client factory
│   ├── tour/                       # Guided product tour steps and config
│   ├── utils/                      # Helpers (chart, export, filter, general)
│   ├── validators/                 # Zod validation schemas
│   └── types.ts                    # Shared TypeScript interfaces
│
├── contexts/                       # React context providers
│
├── etl/                            # Python ETL pipeline (data import)
│   ├── main.py                     # Import script with change notifications
│   ├── master-schema.json          # Source-of-truth database schema export
│   ├── requirements.txt            # Python dependencies
│   └── run.sh                      # ETL runner script
│
├── documentation/                  # Technical documentation
│   ├── sql/                        # Supabase migration scripts
│   ├── tech-stack.md               # Detailed tech stack reference
│   ├── project-architecture.md     # Architecture and data flow
│   ├── schema-migration-guide.md   # Database schema reference
│   ├── developer-workflow.md       # Developer guide and coding standards
│   ├── api-caching-swr.md          # Dashboard API SWR cache reference
│   ├── supabase-auth-setup.md      # Auth setup guide
│   ├── supabase-saved-filters.md   # Saved filters spec
│   ├── user-exports.md             # Export audit log and Storage archive
│   ├── ui-column-mapping.md        # UI label to database column mapping
│   ├── logo-integration.md         # Logo.dev integration guide
│   └── map-disputed-boundaries.md  # Choropleth boundary handling
│
├── scripts/                        # Standalone scripts (e.g. load benchmark)
├── types/                          # Additional type definitions
├── public/                         # Static assets (logos, images, data)
└── styles/                         # Additional stylesheets
```

---

## Getting Started

### Prerequisites
- **Node.js 20.9+**
- **npm** (v9+)
- **Neon PostgreSQL:** Connection string for the data warehouse.
- **Supabase Project:** For authentication and user state.
- **MapTiler API Key:** For the geospatial views.

### Installation

1. **Clone the Repository:**
    ```bash
    git clone https://github.com/Bamboo-Reports/bamboo-reports-nextjs.git
    cd bamboo-reports-nextjs
    ```

2. **Install Dependencies:**
    ```bash
    npm install
    ```

3. **Environment Setup:**
    Duplicate the example file and fill in your secrets.
    ```bash
    cp .env.example .env.local
    ```

4. **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the app.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint checks |
| `npm run prisma:generate` | Regenerate the Prisma Client after schema changes |
| `npm run benchmark` | Benchmark dashboard data loading (`scripts/benchmark-loading.mjs`) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Neon PostgreSQL pooled runtime connection string used by Prisma Client. |
| `DIRECT_URL` | No | Direct Neon connection string for Prisma CLI commands. Falls back to `DATABASE_URL`. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase public anon key (safe for client). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service-role secret. Server-only — used to write/read `user_exports` and upload archived exports to Storage. |
| `DASHBOARD_CACHE_TTL_MS` | No | Override for the in-memory dashboard cache TTL. Default: `3600000` (1 hour). |
| `NEXT_PUBLIC_MAPTILER_KEY` | **Yes** | MapTiler public key for rendering map tiles. |
| `NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID` | No | MapTiler style ID for state choropleth view. |
| `NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID` | No | MapTiler style ID for city-level view. |
| `NEXT_PUBLIC_MAPTILER_STYLE_ID` | No | Legacy fallback style ID (used if mode-specific IDs are not set). |
| `NEXT_PUBLIC_MAP_VIEWPOINT_ISO2` | No | Geopolitical viewpoint for choropleth (e.g., `IN` for India). |
| `NEXT_PUBLIC_LOGO_DEV_KEY` | No | Logo.dev publishable key for company logos. |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog project API key for analytics. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host URL (defaults to PostHog cloud). |
| `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` | No | Feature flag: `enabled` or `disabled`. |
| `NEXT_PUBLIC_MAINTENANCE_MODE` | No | Set to `true` to show a maintenance page instead of the dashboard. |
| `NEXT_PUBLIC_ENVIRONMENT_LABEL` | No | Environment tag displayed in the UI: `DEV`, `PROD`, or empty. |

---

## Deployment Config

Two local config files control client-specific packaging without changing the core dashboard:

- `lib/config/dashboard-access.ts`
  - Controls whether top-level sections like `accounts`, `centers`, and `prospects` are accessible.
  - Also supports deployment-level `prospectsPerAccount` packaging, so a client can see only the first `N` contacts per account while the total prospects badge still reflects the full platform count.
  - When a prospect limit is configured, the remaining contacts stay visible only as locked teaser rows/cards. They do not expose real names, emails, LinkedIn URLs, search results, or export rows.
  - The same config is respected by dashboard navigation, search, exports, and server-side export enforcement.
- `lib/config/filters.ts`
  - Controls which individual filters are enabled.
  - Also controls premium `Show More` behavior for Account and Center filters via `showMoreEnabled` and `premiumFilterKeys`.

Typical use cases:

- Client only needs Accounts + Prospects:
  - Set `centers` to `"disabled"` in `lib/config/dashboard-access.ts`
- Client bought only 2 contacts per account:
  - Set `limits.prospectsPerAccount` to `2` in `lib/config/dashboard-access.ts`
- Client should see all contacts again:
  - Set `limits.prospectsPerAccount` to `null` in `lib/config/dashboard-access.ts`
- Client has standard filters only:
  - Set `showMoreEnabled: false` for the relevant filter section in `lib/config/filters.ts`

---

## Authentication & Authorization

The app delegates identity management to **Supabase Auth**.

- **Sign Up/Login:** Standard Email/Password flow.
- **Session Persistence:** Handled via HTTP-only cookies (Next.js server-side).
- **Role-Based Access Control:**
  - `viewer` — Read-only access to the dashboard.
  - `admin` — Read access plus data export capabilities.
- **User Data:**
  - **`public.profiles`**: Stores user metadata (First Name, Last Name, Email, Role).
  - **`public.saved_filters`**: Stores JSON blobs of user's filter configurations.
  - **`public.user_exports`**: Audit log of exports with metadata (IP, user-agent, row counts, filters snapshot). Pairs with the private `user-exports` Storage bucket for the archived `.xlsx` files.
- **Security:** Row-Level Security (RLS) ensures full data isolation between users.

> **Setup Guides:**
> - Auth & profiles: [Supabase Auth Setup](documentation/supabase-auth-setup.md)
> - Exports audit log + bucket: [User Exports & Audit Log](documentation/user-exports.md)

---

## Database & Schema

The core BI data resides in **Neon PostgreSQL**. All tables follow strict `snake_case` naming.

### Core Tables
| Table | Description | Primary Key |
|-------|-------------|-------------|
| `accounts` | Top-level company entities with HQ details, financials, workforce | `account_global_legal_name` |
| `centers` | Delivery centers / office locations with geospatial data | `cn_unique_key` |
| `services` | Service-line rows linked to centers | `uuid` |
| `functions` | Function rows linked to centers | `uuid` |
| `tech` | Technology stack rows (software, vendors, categories) | `uuid` |
| `prospects` | Contact/lead rows linked to accounts | `uuid` |
| `alias` | Alternate account names (brand, abbreviation, flagship products) | `uuid` |

### Audit Tables (in `audit` schema)
- `audit.import_runs` — Data import tracking
- `audit.field_change_events` — Field-level audit log
- `audit.notification_reads` — Notification read status

### Key Relationships
- `centers` link to `accounts` via `account_global_legal_name`
- `services`, `functions`, and `tech` link to `centers` via `cn_unique_key`
- `prospects` and `alias` link to `accounts` via `account_global_legal_name`

> **Reference:** See the [Schema Migration Guide](documentation/schema-migration-guide.md) for complete column definitions and table relationships.

---

## Analytics & Monitoring

### PostHog
Product analytics integrated via `posthog-js`. Tracks:
- Dashboard page views and session duration
- Filter interactions and saved filter usage
- Export actions and tab navigation
- User identification tied to Supabase user ID

Configuration: Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` environment variables.

### Vercel Analytics
Page performance monitoring via `@vercel/analytics`. Automatically tracks Core Web Vitals when deployed on Vercel.

---

## Deployment

### Vercel (Recommended)

This project is optimized for Vercel.

1. **Push to GitHub.**
2. **Import in Vercel:** Select the repository.
3. **Configure Environment Variables:** Add all required keys from the table above.
4. **Deploy:** Vercel auto-detects Next.js and builds.

Subsequent pushes to the `main` branch trigger automatic deployments.

### Build Configuration
- TypeScript errors are ignored during builds (`typescript.ignoreBuildErrors: true`)
- Images are unoptimized (`images.unoptimized: true`); `img.logo.dev` is the only allowed remote pattern
- HTTP response compression is enabled (`compress: true`)

---

## Troubleshooting

| Issue | Possible Cause | Solution |
| :--- | :--- | :--- |
| **Map not loading** | Invalid MapTiler Key | Check `NEXT_PUBLIC_MAPTILER_KEY`. Ensure the key is active and has map tile access. |
| **"Database connection failed"** | Neon scaling / network | The Neon instance might be sleeping. Retry after a few seconds. Verify `DATABASE_URL`. For Prisma CLI issues, also verify `DIRECT_URL`. |
| **Auth errors (401/403)** | Supabase config | Verify `NEXT_PUBLIC_SUPABASE_URL` and `ANON_KEY`. Check RLS policies in Supabase dashboard. |
| **Missing logos** | Logo.dev key | Ensure `NEXT_PUBLIC_LOGO_DEV_KEY` is set. If omitted, fallback initials are used. |
| **Notifications not showing** | Feature flag | Set `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=enabled` in your environment. |
| **Charts not rendering** | Data issue | Check browser console for errors. Ensure data is being returned from server actions. |
| **Choropleth seams visible** | MapTiler style | Disable disputed boundary layers in your MapTiler style. See [Map Disputed Boundaries](documentation/map-disputed-boundaries.md). |
| **Export button disabled** | User role | Only `admin` users can export. Update the role in the `profiles` table. |
| **Export fails with "Failed to archive export"** | `user-exports` Storage bucket missing | Create a **private** bucket named exactly `user-exports` in the Supabase dashboard. |
| **Export fails with "Failed to record export: relation 'public.user_exports' does not exist"** | Schema SQL not run | Execute `documentation/user-exports-schema.sql` against your Supabase project. |
| **"My exports" dialog is empty after a successful export** | Dev-server module cache | Hard-refresh the page; restart `next dev`. |

---

## Documentation Reference

Detailed documentation for specific subsystems lives in the `documentation/` folder:

| Document | Description |
|----------|-------------|
| [**Tech Stack**](documentation/tech-stack.md) | Comprehensive technology reference with versions, purposes, and categories |
| [**UI-to-Column Mapping**](documentation/ui-column-mapping.md) | Complete mapping of every UI label to its database column (filters, tables, dialogs, charts) |
| [**Project Architecture**](documentation/project-architecture.md) | High-level design, server actions, state management, and integrations |
| [**Schema Guide**](documentation/schema-migration-guide.md) | Deep dive into the data model, table relationships, and migration paths |
| [**Developer Workflow**](documentation/developer-workflow.md) | Guide for common tasks, coding standards, and troubleshooting |
| [**API Caching (SWR)**](documentation/api-caching-swr.md) | Stale-while-revalidate cache behavior for the `/api/dashboard` route |
| [**Supabase Auth**](documentation/supabase-auth-setup.md) | Setting up the `profiles` table, RLS policies, and auth triggers |
| [**Saved Filters**](documentation/supabase-saved-filters.md) | Technical spec for the saved filters JSON structure |
| [**User Exports & Audit Log**](documentation/user-exports.md) | Server-side export generation, Storage archive, and audit table |
| [**Logo Integration**](documentation/logo-integration.md) | Setup and usage guide for the Logo.dev integration |
| [**Map Disputed Boundaries**](documentation/map-disputed-boundaries.md) | State choropleth disputed-boundary behavior and alias rules |

---

## License

Proprietary software owned by ResearchNXT.
