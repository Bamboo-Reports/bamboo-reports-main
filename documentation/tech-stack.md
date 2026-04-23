# Tech Stack Reference

A comprehensive breakdown of every technology used in the Bamboo Reports project, organized by category. This document is designed to give both technical and non-technical stakeholders a clear understanding of what powers the application and why each technology was chosen.

> **Last Updated:** April 2026
> **Audience:** Engineering leads, project managers, and stakeholders

---

## Table of Contents

- [At a Glance](#at-a-glance)
- [Core Framework](#1-core-framework)
- [UI and Styling](#2-ui-and-styling)
- [Data Visualization](#3-data-visualization)
- [Geospatial and Maps](#4-geospatial-and-maps)
- [Backend and Databases](#5-backend-and-databases)
- [Authentication and Security](#6-authentication-and-security)
- [Data Export](#7-data-export)
- [Analytics and Monitoring](#8-analytics-and-monitoring)
- [Form Handling and Validation](#9-form-handling-and-validation)
- [Utility Libraries](#10-utility-libraries)
- [Development Tools](#11-development-tools)
- [Infrastructure and Deployment](#12-infrastructure-and-deployment)
- [AI and Agentic Capabilities](#13-ai-and-agentic-capabilities)
- [External APIs](#14-external-apis)
- [Architecture Decisions](#architecture-decisions)

---

## At a Glance

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 14, React 18, TypeScript 5, Tailwind CSS |
| **Component Library** | shadcn/ui (built on Radix UI primitives) |
| **Charts** | Recharts, Highcharts |
| **Maps** | MapLibre GL, MapTiler |
| **Database** | Neon PostgreSQL (data warehouse), Supabase PostgreSQL (auth/user data) |
| **Authentication** | Supabase Auth |
| **Analytics** | PostHog, Vercel Analytics, Vercel Speed Insights |
| **Export** | ExcelJS |
| **Deployment** | Vercel |

---

## 1. Core Framework

These are the foundational technologies that the entire application is built on.

### Next.js 14.2

| | |
|---|---|
| **What it is** | A React framework for building full-stack web applications |
| **Version** | 14.2.x |
| **Why we use it** | Provides the App Router for file-based routing, Server Actions for secure server-side data fetching without a separate API layer, server-side rendering (SSR) for initial page loads, and automatic code splitting for performance |
| **Key features used** | App Router, Server Actions, Server Components, file-based routing |
| **Package** | `next` |

### React 18.2

| | |
|---|---|
| **What it is** | A JavaScript library for building user interfaces |
| **Version** | 18.2.x |
| **Why we use it** | Industry-standard UI library with a rich ecosystem. React 18 brings concurrent rendering features and automatic batching for better performance |
| **Key features used** | Hooks (`useState`, `useMemo`, `useCallback`, `useEffect`), `React.memo` for performance optimization, custom hooks pattern |
| **Package** | `react`, `react-dom` |

### TypeScript 5

| | |
|---|---|
| **What it is** | A typed superset of JavaScript that compiles to plain JavaScript |
| **Version** | 5.x |
| **Why we use it** | Catches bugs at compile time, provides IntelliSense in editors, and makes the codebase self-documenting. Strict mode is enabled for maximum type safety |
| **Configuration** | Strict mode enabled, path aliases (`@/*`), ES6 target, bundler module resolution |
| **Package** | `typescript` |

---

## 2. UI and Styling

Technologies responsible for how the application looks and feels.

### Tailwind CSS 3.4

| | |
|---|---|
| **What it is** | A utility-first CSS framework |
| **Version** | 3.4.17 |
| **Why we use it** | Enables rapid UI development with consistent spacing, colors, and responsive design. Eliminates CSS naming conflicts and dead code through tree-shaking |
| **Key features used** | Custom theme with HSL color variables, dark mode (class-based), custom animations (accordion, fade-in, slide-in, shimmer, pulse), responsive breakpoints |
| **Fonts** | DM Sans (with system fallbacks) |
| **Plugins** | `tailwindcss-animate` for animation utilities |
| **Package** | `tailwindcss`, `tailwind-merge`, `tailwindcss-animate`, `autoprefixer`, `postcss` |

### shadcn/ui + Radix UI

| | |
|---|---|
| **What it is** | A collection of accessible, unstyled UI components (Radix UI) with pre-built styled variants (shadcn/ui) |
| **Why we use it** | Provides production-ready, accessible (WCAG-compliant) components without vendor lock-in. Components are copied into the project and fully customizable |
| **Components used** | Accordion, AlertDialog, Avatar, Checkbox, Collapsible, Dialog, DropdownMenu, HoverCard, Label, Popover, Progress, ScrollArea, Select, Separator, Slider, Switch, Tabs, Toast, Toggle, Tooltip, and more |
| **Package** | `@radix-ui/react-*` (25+ individual packages) |

### Lucide React

| | |
|---|---|
| **What it is** | A modern icon library with 1500+ icons |
| **Version** | 0.454.0 |
| **Why we use it** | Consistent, tree-shakeable SVG icons that match the shadcn/ui design language |
| **Package** | `lucide-react` |

### next-themes

| | |
|---|---|
| **What it is** | Theme management for Next.js |
| **Why we use it** | Provides dark/light mode switching with system preference detection and zero flash on page load |
| **Package** | `next-themes` |

### DM Sans

| | |
|---|---|
| **What it is** | Low-contrast geometric sans-serif designed by Colophon Foundry, served from Google Fonts |
| **Why we use it** | Clean, modern typography with good legibility at small sizes; variable font provides fine-grained weight and optical-size control in a single file |
| **Loaded via** | `<link>` to `fonts.googleapis.com` in `app/layout.tsx`; applied as the first entry in the Tailwind `sans` stack and the `body` font-family in `app/globals.css` |

### Class Variance Authority (CVA)

| | |
|---|---|
| **What it is** | A utility for creating variant-based component styles |
| **Version** | 0.7.1 |
| **Why we use it** | Used by shadcn/ui to define component variants (e.g., button sizes, alert types) in a type-safe way |
| **Package** | `class-variance-authority` |

### Additional UI Utilities

| Package | Purpose |
|---------|---------|
| `clsx` (2.1.1) | Conditional classname joining |
| `cmdk` | Command palette component |
| `embla-carousel-react` | Carousel/slider component |
| `input-otp` | OTP input component |
| `react-day-picker` | Date picker component |
| `react-resizable-panels` | Resizable panel layouts |
| `sonner` | Toast notification component |
| `vaul` | Drawer/sheet component |
| `driver.js` (1.4.0) | Guided product tours and onboarding walkthroughs |

---

## 3. Data Visualization

Technologies for rendering charts, graphs, and data insights.

### Recharts

| | |
|---|---|
| **What it is** | A composable charting library built on React and D3 |
| **Version** | 2.15.4 |
| **Why we use it** | Provides declarative, React-native chart components. Simple API for common chart types (pie, donut, bar) with responsive containers |
| **Used for** | Pie charts and donut charts for categorical breakdowns (Region, Nature, Revenue ranges, Employee ranges) |
| **Package** | `recharts` |

### Highcharts

| | |
|---|---|
| **What it is** | A professional-grade charting library for interactive visualizations |
| **Version** | 12.1.2 |
| **Why we use it** | Handles advanced visualization needs (treemaps) that require more sophisticated rendering than Recharts provides |
| **Used for** | Technology treemap visualizations showing software vendor and tool distribution |
| **Package** | `highcharts`, `highcharts-react-official` |

---

## 4. Geospatial and Maps

Technologies for rendering interactive maps and geospatial data.

### MapLibre GL

| | |
|---|---|
| **What it is** | An open-source library for rendering interactive maps using WebGL |
| **Version** | 4.7.1 |
| **Why we use it** | Open-source (no vendor lock-in), WebGL-based (handles 5000+ map points efficiently), supports vector tiles, clustering, and custom styling |
| **Used for** | Center location cluster maps, state-level choropleth overlays |
| **Package** | `maplibre-gl`, `@vis.gl/react-maplibre` (React bindings) |

### MapTiler

| | |
|---|---|
| **What it is** | A map tile service providing vector and raster tiles |
| **Why we use it** | Provides high-quality base map tiles. Supports custom styles for different map modes (state view, city view) and geopolitical boundary configurations |
| **Configuration** | API key + optional custom style IDs for state and city views |
| **Environment variables** | `NEXT_PUBLIC_MAPTILER_KEY`, `NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID`, `NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID` |

---

## 5. Backend and Databases

Technologies for storing and querying data.

### Neon PostgreSQL

| | |
|---|---|
| **What it is** | A serverless PostgreSQL platform with autoscaling and branching |
| **Version** | `@neondatabase/serverless` 1.0.x |
| **Why we use it** | Acts as the primary Business Intelligence data warehouse. Serverless architecture means zero cold-start issues in production. Native support for Vercel Edge functions |
| **Access pattern** | Read-only SQL queries via `@neondatabase/serverless` driver |
| **Key features** | Connection pooling, serverless WebSocket connections, parameterized queries (SQL injection safe) |
| **Tables** | `accounts`, `centers`, `services`, `functions`, `tech`, `prospects`, plus audit tables |
| **Retry logic** | 3 retries with exponential backoff (1s, 2s, 4s) |
| **Package** | `@neondatabase/serverless` |

### Dashboard API Route (`/api/dashboard`)

| | |
|---|---|
| **What it is** | A Next.js Route Handler that serves the full dashboard dataset to the client on initial load |
| **Why we use it** | Wraps the underlying Server Action with an in-memory stale-while-revalidate (SWR) cache and gzip compression, so warm requests skip the database round-trip and ship pre-compressed JSON to the browser |
| **Caching** | In-memory SWR with a 5-minute TTL (configurable via `DASHBOARD_CACHE_TTL_MS`); stale responses are served immediately while a background revalidation refreshes the cache |
| **Compression** | Pre-gzipped payload returned when the client sends `Accept-Encoding: gzip`; raw JSON otherwise |
| **Authentication** | Requires a Supabase JWT bearer token in the `Authorization` header, validated server-side before any cached data is returned |
| **Cache invalidation** | `POST /api/dashboard` (also auth-gated) clears the cache; called by the client before a force-refresh |

### Supabase PostgreSQL

| | |
|---|---|
| **What it is** | An open-source Firebase alternative built on PostgreSQL |
| **Version** | 2.49.1 (JS client) |
| **Why we use it** | Provides authentication, user profiles, and saved filter storage. Built-in Row-Level Security (RLS) ensures data isolation between users without custom middleware |
| **Tables managed** | `public.profiles` (user metadata), `public.saved_filters` (filter configurations) |
| **Package** | `@supabase/supabase-js` |

---

## 6. Authentication and Security

Technologies for managing user identity and access control.

### Supabase Auth

| | |
|---|---|
| **What it is** | An authentication service built into Supabase |
| **Why we use it** | Handles user registration, login, session management, and JWT token generation. Integrates natively with Supabase's Row-Level Security for zero-trust data access |
| **Auth flow** | Email/Password registration and login |
| **Session management** | HTTP-only cookies (server-side) |
| **Roles** | `viewer` (read-only), `admin` (read + export) |
| **Security features** | Row-Level Security (RLS) on all user-specific tables, JWT-based sessions |

---

## 7. Data Export

Technologies for generating downloadable reports.

### ExcelJS

| | |
|---|---|
| **What it is** | A library for reading, manipulating, and writing Excel files |
| **Version** | 4.4.0 |
| **Why we use it** | Generates native `.xlsx` files directly in the browser without a server roundtrip. Supports multiple sheets, styling, and large datasets |
| **Used for** | Exporting filtered dashboard data (Accounts, Centers, Prospects) into multi-sheet Excel workbooks |
| **Package** | `exceljs` |

### JSZip

| | |
|---|---|
| **What it is** | A library for creating and reading ZIP files |
| **Version** | 3.10.1 |
| **Why we use it** | Compresses exported Excel files for faster downloads |
| **Package** | `jszip` |

---

## 8. Analytics and Monitoring

Technologies for tracking usage and performance.

### PostHog

| | |
|---|---|
| **What it is** | An open-source product analytics platform |
| **Version** | 1.351.3 |
| **Why we use it** | Tracks user behavior, feature usage, and engagement patterns. Helps the team understand which features are most valuable and where users encounter friction |
| **Events tracked** | Page views, filter interactions, export actions, tab navigation, session duration |
| **User identification** | Tied to Supabase user ID |
| **Package** | `posthog-js` |

### Vercel Analytics

| | |
|---|---|
| **What it is** | Page view and visitor analytics built into the Vercel platform |
| **Version** | 1.3.1 |
| **Why we use it** | Provides privacy-friendly traffic analytics without any additional infrastructure |
| **Package** | `@vercel/analytics` |

### Vercel Speed Insights

| | |
|---|---|
| **What it is** | Real-user performance monitoring built into the Vercel platform |
| **Version** | 2.0.x |
| **Why we use it** | Automatically tracks Core Web Vitals (LCP, INP, CLS) from real users and provides insights into page performance without any additional infrastructure |
| **Package** | `@vercel/speed-insights` |

---

## 9. Form Handling and Validation

Technologies for managing form state and validating user input.

### React Hook Form

| | |
|---|---|
| **What it is** | A performant form library for React |
| **Why we use it** | Manages form state with minimal re-renders. Integrates with Zod for type-safe validation |
| **Package** | `react-hook-form`, `@hookform/resolvers` |

### Zod

| | |
|---|---|
| **What it is** | A TypeScript-first schema validation library |
| **Version** | 3.24.1 |
| **Why we use it** | Validates external inputs (form submissions, saved filter JSON) at runtime. Provides type inference so validation schemas and TypeScript types stay in sync |
| **Package** | `zod` |

---

## 10. Utility Libraries

General-purpose libraries used across the application.

| Library | Version | Purpose |
|---------|---------|---------|
| **date-fns** | 4.1.0 | Date manipulation and formatting (lightweight alternative to Moment.js) |
| **Yahoo Finance 2** | 3.13.2 | Fetching stock prices and financial metrics for account entities |

---

## 11. Development Tools

Tools used during development but not shipped to production.

| Tool | Version | Purpose |
|------|---------|---------|
| **ESLint** | 9.39.2 | JavaScript/TypeScript linting for code quality |
| **eslint-config-next** | 16.1.5 | Next.js-specific ESLint rules (accessibility, best practices) |
| **PostCSS** | 8.5 | CSS processing pipeline (required by Tailwind CSS) |
| **@types/node** | 22 | TypeScript definitions for Node.js APIs |
| **@types/react** | 18 | TypeScript definitions for React |
| **@types/react-dom** | 18 | TypeScript definitions for React DOM |
| **baseline-browser-mapping** | 2.9.18 | Browser compatibility baseline checks |

---

## 12. Infrastructure and Deployment

How the application is built, deployed, and served.

### Vercel

| | |
|---|---|
| **What it is** | A cloud platform optimized for frontend and full-stack applications |
| **Why we use it** | Native Next.js support (built by the same team), automatic CI/CD on git push, global CDN, serverless functions, preview deployments for PRs |
| **Build command** | `next build` |
| **Start command** | `next start` |
| **Environment** | Variables configured in Vercel dashboard |

### Build Configuration

| Setting | Value | Why |
|---------|-------|-----|
| ESLint during builds | Ignored | Prevents build failures from non-critical lint warnings |
| TypeScript errors during builds | Ignored | Allows deployment while type issues are being resolved |
| Image optimization | Disabled (`unoptimized: true`) | Static export compatibility |

---

## 13. AI and Agentic Capabilities

Runtime AI services that power agentic features in the application.

### OpenRouter

| | |
|---|---|
| **What it is** | A unified API gateway that routes requests across many LLM providers (Anthropic, OpenAI, Google, Meta, Mistral, and others) through a single endpoint and billing relationship |
| **Why we use it** | Powers the application's agentic capabilities. A single integration unlocks access to every major model, so we can pick the best model per task (reasoning, tool use, summarization, cost-sensitive workloads) without maintaining a separate SDK and credential for each provider. Also avoids vendor lock-in — swapping models is a config change, not a code change |
| **Used for** | Agent loops, tool-calling, and any LLM-driven feature in the dashboard |
| **Authentication** | API key passed via `Authorization: Bearer` header |
| **Environment variable** | `OPENROUTER_API_KEY` |

---

## 14. External APIs

Third-party services the application communicates with at runtime.

| Service | Purpose | Required | Environment Variable |
|---------|---------|----------|---------------------|
| **Neon PostgreSQL** | Primary BI data warehouse | Yes | `DATABASE_URL` |
| **Supabase** | Authentication, profiles, saved filters | Yes | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **MapTiler** | Map tiles for geospatial views | Yes | `NEXT_PUBLIC_MAPTILER_KEY` |
| **Logo.dev** | Company logo images | No | `NEXT_PUBLIC_LOGO_DEV_TOKEN` |
| **PostHog** | Product analytics | No | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| **Yahoo Finance** | Stock prices and financial data | No | None (public API) |
| **OpenRouter** | LLM gateway for agentic capabilities | Yes | `OPENROUTER_API_KEY` |

---

## Architecture Decisions

A summary of key technology choices and the reasoning behind them.

### Why Server Actions (with one Route Handler) instead of REST/GraphQL?
The vast majority of data fetching uses Server Actions, which eliminate the boilerplate of building and maintaining a separate API layer and keep data fetching co-located with the UI code. The one exception is `/api/dashboard`, a Next.js Route Handler that wraps the dashboard Server Action to add an in-memory SWR cache, gzip compression, and explicit bearer-token auth — capabilities that don't fit neatly into the Server Action model. The Route Handler is gated by Supabase JWT validation so the small expansion of attack surface stays bounded.

### Why raw SQL instead of an ORM (e.g., Prisma)?
The data warehouse queries are primarily read-only and require fine-grained control over joins, aggregations, and filtering logic. Raw SQL with parameterized queries via `@neondatabase/serverless` provides maximum performance and flexibility without the overhead of an ORM abstraction layer.

### Why two databases (Neon + Supabase)?
Each database serves a distinct purpose:
- **Neon** holds the BI data warehouse (read-only, large datasets, optimized for analytics queries).
- **Supabase** handles user-facing concerns (authentication, profiles, saved filters) with built-in Row-Level Security.

This separation keeps the BI data warehouse isolated from user mutations and simplifies security boundaries.

### Why Recharts AND Highcharts?
Recharts handles the majority of charting needs (pie, donut) with a simple React-native API. Highcharts is used specifically for treemap visualizations where Recharts lacks support. This avoids over-engineering a single charting solution while using the best tool for each visualization type.

### Why MapLibre instead of Google Maps or Mapbox?
MapLibre is open-source (no per-load pricing), supports WebGL rendering for large point datasets (5000+ centers), and works with any tile provider (MapTiler in our case). This avoids vendor lock-in and reduces operational costs.

### Why client-side filtering instead of server-side?
After the initial data load, filtering happens client-side in React state. This provides instant UI feedback without network latency. The dataset sizes (typically under 10,000 rows per entity) are well within browser memory limits, making this approach both fast and practical.
