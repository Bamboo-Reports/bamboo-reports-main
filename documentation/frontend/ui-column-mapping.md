# UI-to-Database Column Mapping

A complete reference mapping every user-facing label in the application to its source database column. This document covers filters, data tables, detail dialogs, charts, and summary cards.

> **Last Updated:** October 2026
> **Audience:** Frontend developers, backend engineers, data engineers, QA testers

---

## Table of Contents

- [1. Filters (Sidebar)](#1-filters-sidebar)
  - [1.1 Account Attributes](#11-account-attributes)
  - [1.2 Center Attributes](#12-center-attributes)
  - [1.3 Prospect Attributes](#13-prospect-attributes)
  - [1.4 Filter Types Reference](#14-filter-types-reference)
- [2. Data Tables](#2-data-tables)
  - [2.1 Accounts Table](#21-accounts-table)
  - [2.2 Centers Table](#22-centers-table)
  - [2.3 Prospects Table](#23-prospects-table)
- [3. Detail Dialogs (Popups)](#3-detail-dialogs-popups)
  - [3.1 Account Details Dialog](#31-account-details-dialog)
  - [3.2 Center Details Dialog](#32-center-details-dialog)
  - [3.3 Prospect Details Dialog](#33-prospect-details-dialog)
- [4. Charts](#4-charts)
  - [4.1 Pie / Donut Charts](#41-pie--donut-charts)
  - [4.2 Tech Treemap](#42-tech-treemap)
- [5. Summary Cards](#5-summary-cards)
- [6. Maps](#6-maps)
  - [6.1 Cluster Map](#61-cluster-map)
  - [6.2 State Choropleth Map](#62-state-choropleth-map)
- [7. Notifications](#7-notifications)
- [8. Export (Excel)](#8-export-excel)
- [Column Quick Reference](#column-quick-reference)

---

## 1. Filters (Sidebar)

The filter sidebar is located on the left side of the dashboard. The Account Visibility switch sits above three collapsible sections: Account Attributes, Center Attributes, and Prospect Attributes. Filters marked "Show More" are premium filters revealed by the section's Show More toggle (`premiumFilterKeys` in `lib/config/filters.ts`). Filters with `enabled: false` in the config are hidden and ignored.

**Source files:**
- `lib/config/filters.ts` (which filters exist, are enabled, or sit behind Show More)
- `components/filters/filter-sections.tsx`
- `components/filters/filters-sidebar.tsx`
- `hooks/use-dashboard-filters.ts`
- `lib/dashboard/filtering-sql.ts` (server-side SQL for every filter)
- `documentation/frontend/filter-column-ui-label-map.json` (machine-readable version of this section)

### 1.1 Account Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Account Visibility | `accountVisibilityMode` | `account_visibility` | `accounts` | Single-select (`All`, `GCCs`, `Non-GCCs`; values `all`, `gcc`, `nonGcc`; default `gcc`) |
| Account Name | `accountGlobalLegalNameKeywords` | `account_global_legal_name` | `accounts` | Keyword (include/exclude), alias-aware autocomplete |
| Account List | `accountListValues` | `account_lists.id` (Supabase) | `account_lists` | Multi-select (include/exclude) of uploaded lists |
| *(no control; derived)* | `accountNameValues` | `account_global_legal_name` | `accounts` | Exact names expanded from the selected account lists on the client |
| HQ Company Revenue | `accountHqRevenueRange` | `account_hq_revenue` | `accounts` | Range slider [min, max] |
| HQ Company Revenue: "Include all" toggle | `accountHqRevenueIncludeNull` | `account_hq_revenue` | `accounts` | Boolean toggle (include NULLs) |
| GCC Aggregate Headcount (India) | `accountCenterEmployeesRangeValues` | `account_center_employees_range` | `accounts` | Multi-select (include/exclude) |
| Years In India | `accountYearsInIndiaRange` | `years_in_india` | `accounts` | Range slider [min, max] |
| Years In India: "Include all" toggle | `yearsInIndiaIncludeNull` | `years_in_india` | `accounts` | Boolean toggle (include NULLs) |
| Industry | `accountPrimaryCategoryValues` | `account_primary_category` | `accounts` | Multi-select (include/exclude) |
| HQ Country | `accountHqCountryValues` | `account_hq_country` | `accounts` | Multi-select (include/exclude) |
| HQ Region (Show More) | `accountHqRegionValues` | `account_hq_region` | `accounts` | Multi-select (include/exclude) |
| HQ Employee Range (Show More) | `accountHqEmployeeRangeValues` | `account_hq_employee_range` | `accounts` | Multi-select (include/exclude) |
| Sub Industry (Show More) | `accountHqIndustryValues` | `account_hq_industry` | `accounts` | Multi-select (include/exclude) |
| Segment (Show More) | `accountPrimaryNatureValues` | `account_primary_nature` | `accounts` | Multi-select (include/exclude) |
| NASSCOM GCC Listing Status (Show More) | `accountNasscomStatusValues` | `account_nasscom_status` | `accounts` | Multi-select (include/exclude) |
| Source (disabled) | `accountSourceValues` | `account_source` | `accounts` | Multi-select (include/exclude) |
| Type (disabled) | `accountTypeValues` | `account_type` | `accounts` | Multi-select (include/exclude) |
| Coverage (disabled) | `accountDataCoverageValues` | `account_data_coverage` | `accounts` | Multi-select (include/exclude) |

> **Note:** Account lists live in Supabase (`account_lists`, shareable through `account_list_shares`), not in the warehouse. `lib/accounts/account-lists.ts` (`expandAccountLists`) turns the selected lists into `accountNameValues`, so the server only ever filters on exact `account_global_legal_name` values.

### 1.2 Center Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Status | `centerStatusValues` | `center_status` | `centers` | Multi-select (include/exclude) |
| Centre Type | `centerTypeValues` | `center_type` | `centers` | Multi-select (include/exclude) |
| Services Offered | `functionNameValues` | `function_name` | `functions` | Multi-select (include/exclude) |
| City | `centerCityValues` | `center_city` | `centers` | Multi-select (include/exclude) |
| Incorporation Timeline | `centerIncYearRange` | `center_inc_year` | `centers` | Range slider [min, max] |
| Incorporation Timeline: "Include all" toggle | `centerIncYearIncludeNull` | `center_inc_year` | `centers` | Boolean toggle (include NULLs) |
| Centre Headcount | `centerEmployeesRangeValues` | `center_employees_range` | `centers` | Multi-select (include/exclude) |
| State (Show More) | `centerStateValues` | `center_state` | `centers` | Multi-select (include/exclude) |
| Centre Focus (Show More) | `centerFocusValues` | `center_focus` | `centers` | Multi-select (include/exclude) |
| Software In Use (Show More) | `techSoftwareInUseKeywords` | `software_in_use` | `tech` | Keyword (include/exclude) |
| Country (disabled) | `centerCountryValues` | `center_country` | `centers` | Multi-select (include/exclude) |

> **Note:** "Services Offered" filters via the `functions` table joined through `cn_unique_key`. "Software In Use" filters via the `tech` table joined through `cn_unique_key`.

### 1.3 Prospect Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Job Title | `prospectTitleKeywords` | `prospect_title` | `prospects` | Keyword (include/exclude) |
| Role | `prospectHeadTypeValues` | `head_type` | `prospects` | Multi-select (include/exclude) |
| Seniority Level | `prospectLevelValues` | `prospect_level` | `prospects` | Multi-select (include/exclude) |
| Department | `prospectDepartmentValues` | `prospect_department` | `prospects` | Multi-select (include/exclude) |
| City | `prospectCityValues` | `prospect_city` | `prospects` | Multi-select (include/exclude) |
| Engaged | `prospectEngagedValues` | `prospect_engaged` | `prospects` | Multi-select (include/exclude); values come from the sheet (`Yes` when the prospect has a `subscribers` row) |

### 1.4 Filter Types Reference

| Filter Type | UI Control | Data Structure | Behavior |
|-------------|-----------|----------------|----------|
| **Single-select** | `ViewSwitcher` (`components/ui/view-switcher.tsx`, full width in `filters-sidebar.tsx`, the same control as Chart / Data / Map) | `AccountVisibilityMode` (`"all" \| "gcc" \| "nonGcc"`) | Applies immediately. |
| **Multi-select (include/exclude)** | `EnhancedMultiSelect` dropdown (Account List uses `AccountListPicker` on the same control) | `FilterValue[]`: `{ value: string, mode: 'include' \| 'exclude' }` | Green badge = include, Red badge = exclude. Options show count of matching records. |
| **Keyword (include/exclude)** | `TitleKeywordInput` text field (Account Name uses `AccountAutocomplete`) | `FilterValue[]`: `{ value: string, mode: 'include' \| 'exclude' }` | Keyword added on Enter. Matches partial strings (case-insensitive) in the target column. |
| **Range slider** | `Slider` with min/max handles plus Min/Max inputs | `[number, number]` tuple | Linear steps. Filters records where the column value falls within the range. |
| **Boolean toggle** | Checkbox ("Include all") | `boolean` | When enabled, includes records where the column value is NULL (no data). |

---

## 2. Data Tables

Each tab in the dashboard displays a paginated data table (or a card grid, toggled per tab). Pages hold 51 rows (`itemsPerPage` in `app/page.tsx`). Optional columns can be hidden per user through the column menu (`lib/dashboard/table-column-preferences.ts`, `components/tables/table-column-menu.tsx`); columns marked required always show.

### 2.1 Accounts Table

**Source files:** `components/tabs/accounts-tab.tsx`, `components/tables/account-row.tsx`, `components/cards/account-grid-card.tsx` (grid view)

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Logo)* | `account_hq_website` | `accounts` | Company logo image | Brandfetch lookup by domain; falls back to a monogram badge |
| Account Name | `account_global_legal_name` | `accounts` | Clickable text | Opens Account Details dialog on click; required column |
| *(NASSCOM badge)* | `account_nasscom_status` | `accounts` | Badge | Shows "NASSCOM" badge when value is `"yes"` (case-insensitive) |
| *(Visibility note badge)* | `account_visibility`, `account_visibility_note` | `accounts` | Badge | Shows the note when `account_visibility = 'exclude'` |
| Sub Industry | `account_hq_industry` | `accounts` | Text | Optional column |
| Revenue Range | `account_hq_revenue_range` | `accounts` | Text | Bucketed range string (e.g., "$1B-$5B"); optional column |
| GCC Aggregate Headcount (India) | `account_center_employees_range` | `accounts` | Text | Bucketed range string (e.g., "1,001-5,000"); optional column |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Location | `account_hq_city`, `account_hq_country` | Shown on the grid card |
| LinkedIn | `account_hq_linkedin_link` | Row context menu |

### 2.2 Centers Table

**Source files:** `components/tabs/centers-tab.tsx`, `components/tables/center-row.tsx`, `components/cards/center-grid-card.tsx` (grid view)

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Logo)* | `center_account_website` | `centers` | Company logo image | Brandfetch lookup by parent account domain |
| Centre Name | `center_name` | `centers` | Clickable text | Opens Center Details dialog on click; secondary line shows `account_global_legal_name`; required column |
| Location | `center_city` + `center_state` | `centers` | Computed text | Format: "City, State" |
| Centre Type | `center_type` | `centers` | Text | Optional column |
| Centre Headcount | `center_employees_range` | `centers` | Text | Bucketed range string; optional column |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Account Name | `account_global_legal_name` | Linking to parent account |
| Unique Key | `cn_unique_key` | Row identification |
| Status | `center_status` | Status dot on the grid card |
| Website / LinkedIn | `center_website`, `center_linkedin` | Row context menu |

### 2.3 Prospects Table

**Source files:** `components/tabs/prospects-tab.tsx`, `components/tables/prospect-row.tsx`, `components/cards/prospect-grid-card.tsx` (grid view)

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Avatar)* | `prospect_first_name`, `prospect_last_name` | `prospects` | Initials badge | Colored circle with first letters of first + last name; required column |
| Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` | Clickable text | Opens Prospect Details dialog on click; secondary line shows `account_global_legal_name`; required column |
| Location | `prospect_city` + `prospect_state` + `prospect_country` | `prospects` | Computed text | Format: "City, State"; falls back to `Country` when city/state is missing |
| Job Title | `prospect_title` | `prospects` | Text | Optional column |
| Department | `prospect_department` | `prospects` | Text | Optional column |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Unique Key | `ps_unique_key` | Row identification, selection exports, prospect detail and engagement lookups |
| Email | `prospect_email` | Row context menu (copy email) |
| LinkedIn | `prospect_linkedin_url` | Row context menu |
| Account | `account_global_legal_name` | Linking to parent account |
| Role / Engaged | `head_type`, `prospect_engaged` | GCC Head / HR Head and Engaged icons on the grid card |

---

## 3. Detail Dialogs (Popups)

Clicking a row in any data table opens a detail dialog with comprehensive information about that entity. Rows with empty values are hidden.

### 3.1 Account Details Dialog

**Source file:** `components/dialogs/account-details-tabbed-dialog.tsx` (related rows from `GET /api/accounts/[name]/related`, `lib/dashboard/account-related.ts`)

This is a tabbed dialog with three tabs: **Account Info**, **Centres**, and **Prospects**. The Centres and Prospects tabs appear only when the account has rows and the section is enabled for the user.

**Header:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Account Name (with logo) | `account_global_legal_name`, `account_hq_website` | `accounts` |
| Website / LinkedIn icons | `account_hq_website`, `account_hq_linkedin_link` | `accounts` |
| Location line | `account_hq_city` + `account_hq_state` + `account_hq_country` (falls back to `account_hq_region`) | `accounts` |

#### Account Info Tab

**Company Snapshot Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| About | `account_about` | `accounts` |
| Key Offerings | `account_hq_key_offerings` (one item per line) | `accounts` |
| Account Type | `account_hq_company_type` | `accounts` |
| Stock Ticker | `account_hq_stock_ticker` | `ticker` (merged onto accounts server-side) |
| HQ Location | `account_hq_city` + `account_hq_state` | `accounts` |
| Country | `account_hq_country` | `accounts` |
| Region | `account_hq_region` | `accounts` |
| Industry | `account_hq_industry` | `accounts` |
| Sub Industry | `account_hq_sub_industry` | `accounts` |
| Primary Category | `account_primary_category` | `accounts` |
| Primary Nature | `account_primary_nature` | `accounts` |
| NASSCOM GCC Listing Status | `account_nasscom_status` | `accounts` |
| Forbes 2000 Rank | `account_hq_forbes_2000_rank` | `accounts` |
| Fortune 500 Rank | `account_hq_fortune_500_rank` | `accounts` |

**Scale & Financials Section** *(market data loaded from `GET /api/financials` via `lib/finance/request-client.ts`, Yahoo Finance, using the account's ticker):*

| UI Label | Data Source | Notes |
|----------|------------|-------|
| Revenue | `account_hq_revenue` (caption `account_hq_revenue_range`) | Shown in millions |
| Market Cap | `financialData.marketCap` | Caption: `financialData.inputTicker` and `financialData.exchange` |
| Net Profit | `financialData.netProfit` | Same caption |
| Employees | `account_hq_employee_count` (caption `account_hq_employee_range`) | `accounts` |
| Annual Revenue (FY) chart | `financialData.annualRevenueSeries` | Array of `{ label, revenue }`, rendered as a Recharts area chart |

**India Presence Section** *(shown when the centers section is enabled):*

| UI Label | Database Column | Table |
|----------|----------------|-------|
| First Centre | `account_first_center_year` | `accounts` |
| Years in India | `years_in_india` | `accounts` |
| Centre Employees | `account_center_employees` | `accounts` |
| GCC Aggregate Headcount (India) | `account_center_employees_range` | `accounts` |
| Primary City | `account_primary_city` | `accounts` |
| Hub Structure | `account_hub_structure` | `accounts` |
| Centres Map | `centers.lat`, `centers.lng` (account's centers) | `centers` |

**Technology Stack Section:**

| Visualization | Data Source | Description |
|---------------|------------|-------------|
| Tech Treemap | `tech` table (filtered by `account_global_legal_name`) | Treemap of software tools grouped by `software_category` |

#### Centres Tab (within Account Dialog)

Filter dropdowns: **Centre Type** (`center_type`) and **Headcount Range** (`center_employees_range`). Each center renders as a `CenterGridCard` (`components/cards/center-grid-card.tsx`):

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Logo | `center_account_website` | `centers` |
| Centre Name | `center_name` | `centers` |
| Status dot | `center_status` | `centers` |
| Location | `center_city` + `center_state` | `centers` |
| Type | `center_type` | `centers` |
| Headcount | `center_employees_range` | `centers` |

#### Prospects Tab (within Account Dialog)

Filter dropdowns: **Head Type** (`head_type`), **Department** (`prospect_department`), **Level** (`prospect_level`). Each prospect renders as a `ProspectGridCard` (`components/cards/prospect-grid-card.tsx`):

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` |
| Account Name | `account_global_legal_name` | `prospects` |
| Location | `prospect_city` + `prospect_state` + `prospect_country` | `prospects` |
| GCC Head / HR Head icon | `head_type` | `prospects` |
| Engaged icon | `prospect_engaged` (`Yes`) | `prospects` |
| Department | `prospect_department` | `prospects` |
| Seniority Level | `prospect_level` | `prospects` |

---

### 3.2 Center Details Dialog

**Source file:** `components/dialogs/center-details-dialog.tsx` (services and tech from `GET /api/centers/[key]`)

**Header:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Centre Name (with logo) | `center_name`, `center_account_website` | `centers` |
| Website / LinkedIn icons | `center_website`, `center_linkedin` | `centers` |
| Status dot | `center_status` | `centers` |
| Account Name (opens the account dialog) | `account_global_legal_name` | `centers` |

**Centre Snapshot Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Primary Services | `primary_service` (one item per line) | `services` |
| Focus Region | `focus_region` (one item per line) | `services` |
| Address | `center_address` | `centers` |
| Status | `center_status` | `centers` |
| Centre Type | `center_type` | `centers` |
| Centre Focus | `center_focus` | `centers` |
| Micro Location | `center_micro_location` | `centers` |
| Location | `center_city` + `center_state` | `centers` |
| Country | `center_country` | `centers` |
| Zip Code | `center_zip_code` | `centers` |
| Boardline | `center_boardline` | `centers` |
| Management Partner | `center_management_partner` | `centers` |
| JV Status | `center_jv_status` | `centers` |
| JV Name | `center_jv_name` | `centers` |

**Scale & Timeline Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Employees | `center_employees` (caption `center_employees_range`) | `centers` |
| Incorporation Year | `center_inc_year` (caption `center_timeline`) | `centers` |
| Announced | `announced_month` + `announced_year` | `centers` |
| End Year | `center_end_year` | `centers` |

**Services Offered Section** *(shown only for categories with data; each line becomes a pill):*

| UI Label | Database Column | Table |
|----------|----------------|-------|
| IT Services | `service_it` | `services` |
| AI Services | `service_ai` | `services` |
| ER&D Services | `service_erd` | `services` |
| Finance & Accounting | `service_fna` | `services` |
| HR Services | `service_hr` | `services` |
| Procurement | `service_procurement` | `services` |
| Sales & Marketing | `service_sales_marketing` | `services` |
| Customer Support | `service_customer_support` | `services` |
| Other Services | `service_others` | `services` |

**Technology Stack Section:**

| Visualization | Data Source | Description |
|---------------|------------|-------------|
| Tech Treemap | `tech` rows for this `cn_unique_key` | Treemap grouped by `software_category` |

---

### 3.3 Prospect Details Dialog

**Source files:** `components/dialogs/prospect-details-dialog.tsx`, `components/dialogs/prospect-engagement-timeline.tsx`

**Header:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` |
| Account Name (opens the account dialog) | `account_global_legal_name` | `prospects` |
| Email / LinkedIn icons | `prospect_email`, `prospect_linkedin_url` | `prospects` |
| GCC Head / HR Head badge | `head_type` | `prospects` |
| Engaged badge | `prospect_engaged` (`Yes`) | `prospects` |

**Snapshot Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Job Title | `prospect_title` | `prospects` |
| Email (with copy button) | `prospect_email` | `prospects` |
| Department | `prospect_department` | `prospects` |
| Level | `prospect_level` | `prospects` |
| In Company Since | `prospect_in_company_year` | `prospects` |
| Current Role Since | `prospect_current_year` | `prospects` |
| Centre | `center_name` | `prospects` |
| Location | `prospect_city` + `prospect_state` | `prospects` |
| Country | `prospect_country` | `prospects` |

**Bamboo Reports Activity Section** *(engaged prospects only; loaded from `GET /api/prospects/[id]/engagements`, keyed by `ps_unique_key`):*

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Touchpoint date (oldest first, with "days ago" and gap labels) | `prospect_engaged_date` | `subscribers` |
| Campaign name and kind (Registration, Download, Snapshot, Campaign) | `prospect_engaged_campaign` | `subscribers` |

Rows are matched with `lower(subscribers.prospect_email) = lower(prospects.prospect_email)`; helpers live in `lib/dashboard/engagements.ts`.

**More Contacts From {account} Section:** other prospects of the same account as `ProspectGridCard`s, with **Head Type**, **Department**, and **Level** filter dropdowns (same columns as the account dialog's Prospects tab).

---

## 4. Charts

### 4.1 Pie / Donut Charts

**Source files:** `components/charts/pie-chart-card.tsx`, `lib/utils/chart-helpers.ts`, `lib/dashboard/dashboard-core.ts` (server buckets behind `GET /api/dashboard/charts`)

Pie charts are rendered using Highcharts as donut charts (inner radius 65%). Segments under 5% of the total are grouped into an "Others" category. In the dashboard the buckets are computed server-side: all 11 chart lists come from one SQL statement over the filtered cascade, then capped to the top 10 (city: top 5 plus "Others"), mirroring the client helpers (`getAccountChartData`, `getCenterChartData`, `getProspectChartData` in `lib/dashboard/charts.ts`).

#### Account Charts

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Country | `account_hq_country` | `accounts` | Count of accounts per HQ country |
| Industry | `account_primary_category` | `accounts` | Count of accounts per primary category |
| Revenue Range | `account_hq_revenue_range` | `accounts` | Count of accounts per revenue bucket |
| GCC Aggregate Headcount (India) | `account_center_employees_range` | `accounts` | Count of accounts per headcount bucket |

#### Center Charts

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Centre Type | `center_type` | `centers` | Count of centers per type (top 10) |
| Centre Headcount | `center_employees_range` | `centers` | Count of centers per headcount bucket (top 10) |
| City | `center_city` | `centers` | Top 5 cities + "Others" bucket |
| Function | `function_name` | `functions` | Count per function over the filtered centers' `cn_unique_key` set (top 10) |

#### Prospect Charts

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Department | `prospect_department` | `prospects` | Count of prospects per department (top 10) |
| Level | `prospect_level` | `prospects` | Count of prospects per level (top 10) |

> A prospect city bucket list (`prospect_city`) is also computed but not rendered as a chart.

### 4.2 Tech Treemap

**Source file:** `components/charts/tech-treemap.tsx`

A Highcharts treemap with a two-level hierarchy. Rendered inside the Account Details and Center Details dialogs (Technology Stack section).

| Level | Database Column | Table | Description |
|-------|----------------|-------|-------------|
| Level 1 (Parent) | `software_category` | `tech` | Groups software tools into categories |
| Level 2 (Child) | `software_in_use` | `tech` | Individual software tools within each category |

**Aggregation:** Counts occurrences of each `software_in_use` within its `software_category`. Treemap tile size represents relative count. Color is assigned per category.

**Filtering:** Scoped to the current account via `account_global_legal_name` (account dialog) or the current center via `cn_unique_key` (center dialog).

---

## 5. Summary Cards

**Source files:** `components/dashboard/summary-cards.tsx`, `lib/dashboard/dashboard-core.ts` (`GET /api/dashboard/summary`)

The summary cards appear at the top of the dashboard showing filtered vs. total counts, computed in SQL.

| Card Title | Filtered Value Source | Total Value Source | Description |
|------------|----------------------|--------------------|--------------------|
| Accounts | Count of filtered `accounts` | Count of all `accounts` | Number of account entities matching current filters |
| Centres | Count of filtered `centers` | Count of all `centers` | Number of center entities matching current filters |
| Upcoming Centres | Filtered `centers` with `center_status = 'Upcoming'` | All `centers` with `center_status = 'Upcoming'` | Overview stat, not clickable |
| Prospects | Count of filtered `prospects` | Count of all `prospects` | Number of prospect entities matching current filters |
| Headcount | Sum of `center_employees` from filtered centers | Sum of `center_employees` from all centers | Excludes centers whose `center_type` is Manufacturing, Sales & Marketing, BPO or Distribution (`CENTER_METRICS` in `lib/dashboard/dashboard-core.ts`); overview stat, not clickable |

**Display format:** Each card shows "X of Y" where X is the filtered count (animated) and Y is the total count. In compact mode (sidebar open), large numbers use K/M notation (truncated, not rounded).

---

## 6. Maps

Both maps are fed by server aggregates (`lib/dashboard/centers-map.ts`, `GET /api/centers/map`) over the filtered centers.

### 6.1 Cluster Map

**Source file:** `components/maps/centers-map.tsx`

Renders one marker per city on an interactive MapLibre map, clustered when zoomed out. The account dialog's Centres Map uses the same component with the account's centers.

| Data Field | Database Column | Table | Usage |
|------------|----------------|-------|-------|
| City | `center_city` | `centers` | Grouping key and tooltip label |
| Country | `center_country` | `centers` | Tooltip context (first center by `center_name`) |
| Latitude | `lat` | `centers` | Marker Y position (first center by `center_name`) |
| Longitude | `lng` | `centers` | Marker X position (first center by `center_name`) |
| Centers | `count(*)` | `centers` | Centers in the city |
| Accounts | `count(distinct account_global_legal_name)` | `centers` | Distinct accounts in the city |
| Headcount | `sum(center_employees)` | `centers` | Total employees in the city |

### 6.2 State Choropleth Map

**Source file:** `components/maps/centers-choropleth-map.tsx`

Renders a state-level heatmap overlay showing center density per administrative region.

| Metric | Database Columns | Aggregation | Description |
|--------|-----------------|-------------|-------------|
| Center Count | `center_state`, `center_country_iso2` | `COUNT(*)` grouped by state | Number of centers in each state |
| Distinct Accounts | `account_global_legal_name` | `COUNT(DISTINCT)` per state | Number of unique accounts per state |
| Headcount | `center_employees` | `SUM` per state | Total employees per state |

**Boundary matching:** Centers are matched to local administrative GeoJSON features using `center_country_iso2` (ISO2 country code) + `center_state` (state name). See `documentation/frontend/map-disputed-boundaries.md`.

---

## 7. Notifications

**Source file:** `hooks/use-notifications.ts`, `app/actions/notifications.ts`

| UI Element | Data Source | Database Table | Description |
|------------|------------|----------------|-------------|
| Notification Bell (unread count) | Count of unread changes | `audit.field_change_events`, `audit.notification_reads` | Number of unviewed field changes |
| Recently Updated Accounts | Changed accounts | `audit.field_change_events` joined to `accounts` | Grouped by `account_global_legal_name` |
| Recently Updated Records | Changed records | `audit.field_change_events` | Grouped by table and record UUID |

---

## 8. Export (Excel)

**Source files:** `components/exports/export-dialog.tsx`, `components/exports/exports-dialog.tsx`, `lib/exports/request-client.ts`, `app/api/exports/generate/route.ts`, `lib/exports/server-builder.ts`

The Excel export is built on the server with ExcelJS and generates a `.xlsx` file with one sheet per selected dataset. Rows come from the current filters (or from a row selection) through the same SQL cascade as the dashboard.

| Sheet | Source Table | Columns | Row Scope |
|-------|-------------|---------|-----------|
| Accounts | `accounts` | Every table column (`select *`) | Filtered accounts, or the selected `account_global_legal_name` values |
| Centres | `centers` | Every table column (`select *`) | Filtered centers, or the selected `cn_unique_key` values |
| Services | `services` | Every table column (`select *`), including the `*_link` columns and `service_comments` | Services whose `cn_unique_key` belongs to the exported centers |
| Prospects | `prospects` | Every table column (`select *`), including internal review fields (`last_review_date`, `email_verification_date`, `contact_status`), `prospect_phone` and `prospect_engaged` | Filtered prospects, or the selected `ps_unique_key` values (or every prospect of the selected accounts) |

**Headers:** the header row uses the raw database column names (`addWorksheet` collects every key that appears in the rows); there is no label mapping.

> **Access:** Export is restricted to users with the `admin` role (checked via `canExportData()` in `lib/auth/roles.ts`).

---

## Column Quick Reference

A flat listing of every database column referenced in the UI, sorted by table. "Export" means the column reaches the Excel export; every table column does, since the export uses `select *`.

### `accounts` table

| Column | Used In |
|--------|---------|
| `account_about` | Account dialog (Company Snapshot) |
| `account_center_employees` | Account dialog (India Presence) |
| `account_center_employees_range` | Filter, Accounts table, Account dialog, Charts |
| `account_data_coverage` | Filter (disabled) |
| `account_first_center_year` | Account dialog (India Presence) |
| `account_global_legal_name` | Filter (Account Name, Account List), Accounts table, Account/Center/Prospect dialogs |
| `account_hq_city` | Account grid card, Account dialog |
| `account_hq_company_type` | Account dialog (Account Type) |
| `account_hq_country` | Filter, Account grid card, Account dialog, Charts |
| `account_hq_employee_count` | Account dialog (Scale & Financials) |
| `account_hq_employee_range` | Filter, Account dialog |
| `account_hq_forbes_2000_rank` | Account dialog (Company Snapshot) |
| `account_hq_fortune_500_rank` | Account dialog (Company Snapshot) |
| `account_hq_industry` | Filter (Sub Industry), Accounts table (Sub Industry), Account dialog |
| `account_hq_key_offerings` | Account dialog (Company Snapshot) |
| `account_hq_linkedin_link` | Account dialog (header), row context menu |
| `account_hq_region` | Filter, Account dialog |
| `account_hq_revenue` | Filter (range), Account dialog (Scale & Financials) |
| `account_hq_revenue_range` | Accounts table, Account dialog, Charts |
| `account_hq_state` | Account dialog (HQ Location) |
| `account_hq_stock_ticker` | Account dialog (Stock Ticker, Financials lookup); lives in the `ticker` table, merged onto accounts server-side |
| `account_hq_sub_industry` | Account dialog |
| `account_hq_website` | Accounts table (logo), Account dialog (header), row context menu |
| `account_hub_structure` | Account dialog (India Presence) |
| `account_nasscom_status` | Filter, Accounts table (badge), Account dialog |
| `account_primary_category` | Filter (Industry), Account dialog, Charts (Industry) |
| `account_primary_city` | Account dialog (India Presence) |
| `account_primary_nature` | Filter (Segment), Account dialog |
| `account_source` | Filter (disabled) |
| `account_type` | Filter (disabled) |
| `account_visibility` | Account Visibility switch, Accounts table (visibility note badge) |
| `account_visibility_note` | Accounts table and grid card (visibility note badge) |
| `years_in_india` | Filter (range), Account dialog (India Presence) |

### `centers` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Centers table (secondary line), Center dialog, Maps (distinct accounts) |
| `announced_month` | Center dialog (Announced) |
| `announced_year` | Center dialog (Announced) |
| `center_account_website` | Centers table (logo), Center dialog (logo) |
| `center_address` | Center dialog (Centre Snapshot) |
| `center_boardline` | Center dialog |
| `center_city` | Filter, Centers table, Center dialog, Charts, Cluster map |
| `center_country` | Filter (disabled), Center dialog, Cluster map |
| `center_country_iso2` | Choropleth map (tile matching) |
| `center_employees` | Summary cards (Headcount), Center dialog, Maps |
| `center_employees_range` | Filter, Centers table, Center dialog, Charts |
| `center_end_year` | Center dialog |
| `center_focus` | Filter, Center dialog |
| `center_inc_year` | Filter (range), Center dialog |
| `center_jv_name` | Center dialog |
| `center_jv_status` | Center dialog |
| `center_linkedin` | Center dialog (header), row context menu |
| `center_management_partner` | Center dialog |
| `center_micro_location` | Center dialog, shown only when present |
| `center_name` | Centers table, Center dialog |
| `center_state` | Filter, Centers table (Location), Center dialog, Choropleth map |
| `center_status` | Filter, Center dialog, Summary cards (Upcoming Centres), status dot |
| `center_timeline` | Center dialog (Incorporation Year caption) |
| `center_type` | Filter, Centers table, Center dialog, Charts, Summary cards (Headcount exclusion) |
| `center_website` | Center dialog (header), row context menu |
| `center_zip_code` | Center dialog |
| `cn_unique_key` | Row identity, Center dialog lookup, Services/Functions/Tech join key |
| `lat` | Cluster map |
| `lng` | Cluster map |

### `services` table

| Column | Used In |
|--------|---------|
| `cn_unique_key` | Join key to the center |
| `focus_region` | Center dialog (Centre Snapshot) |
| `primary_service` | Center dialog (Centre Snapshot) |
| `service_ai` | Center dialog (AI Services) |
| `service_customer_support` | Center dialog |
| `service_erd` | Center dialog |
| `service_fna` | Center dialog |
| `service_hr` | Center dialog |
| `service_it` | Center dialog |
| `service_others` | Center dialog |
| `service_procurement` | Center dialog |
| `service_sales_marketing` | Center dialog |
| `*_link`, `software_source_link`, `service_comments` | Export only |

### `functions` table

| Column | Used In |
|--------|---------|
| `cn_unique_key` | Filter join, Charts join |
| `function_name` | Filter (Services Offered), Charts (Function) |

### `tech` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Tech treemap (account dialog scoping) |
| `cn_unique_key` | Filter join, Tech treemap (center dialog scoping) |
| `software_category` | Tech treemap (Level 1 grouping) |
| `software_in_use` | Filter (keyword), Tech treemap (Level 2) |

### `prospects` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Prospects table (secondary line), Prospect dialog |
| `center_name` | Prospect dialog (Centre) |
| `head_type` | Filter (Role), Prospect dialog and grid card badges, Account/Prospect dialog filters |
| `prospect_city` | Filter, Prospects table, Prospect dialog |
| `prospect_country` | Prospects table (fallback), Prospect dialog |
| `prospect_current_year` | Prospect dialog (Current Role Since) |
| `prospect_department` | Filter, Prospects table, Prospect dialog, Charts |
| `prospect_email` | Prospect dialog, row context menu, engagement lookup key |
| `prospect_engaged` | Filter (Engaged), Engaged badge and icon, gates the activity timeline |
| `prospect_first_name` | Prospects table (avatar, name fallback) |
| `prospect_full_name` | Prospects table, Prospect dialog |
| `prospect_in_company_year` | Prospect dialog (In Company Since) |
| `prospect_last_name` | Prospects table (avatar, name fallback) |
| `prospect_level` | Filter, Prospect dialog, Account dialog (Prospects tab), Charts |
| `prospect_linkedin_url` | Prospect dialog, row context menu |
| `prospect_state` | Prospects table (Location), Prospect dialog |
| `prospect_title` | Filter (keyword), Prospects table, Prospect dialog |
| `ps_unique_key` | Row identity, Prospect dialog and engagement lookups, selection export |
| `prospect_phone` | Export only |
| `last_review_date` | Internal only (no UI), Export |
| `email_verification_date` | Internal only (no UI), Export |
| `contact_status` | Internal only (no UI), Export |

### `subscribers` table

| Column | Used In |
|--------|---------|
| `prospect_email` | Join to prospects (`lower(prospect_email)`) |
| `prospect_engaged_date` | Prospect dialog (Bamboo Reports Activity timeline) |
| `prospect_engaged_campaign` | Prospect dialog (Bamboo Reports Activity timeline) |

### Audit tables

| Column | Table | Used In |
|--------|-------|---------|
| Various change fields | `audit.field_change_events` | Notifications |
| Read status | `audit.notification_reads` | Notification bell unread count |
| Last-read bookmark | `audit.user_notification_state` | Notification bell unread count |
| Import metadata | `audit.import_runs` | Data import tracking |
