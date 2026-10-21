# UI-to-Database Column Mapping

A reference mapping every user-facing label in the application to its source database column. This document covers filters, data tables, detail dialogs, charts, summary cards, maps, notifications and export.

> **Last Updated:** October 2026
> **Audience:** Frontend developers, backend engineers, data engineers, QA testers

**Sources of truth.** When this document and the code disagree, the code wins:

| Area | Source file |
|------|-------------|
| Filter keys, labels, columns, tables, enabled flags | `lib/config/filters.ts` (`FILTER_SECTIONS`) |
| Filter sidebar labels as rendered | `components/filters/filter-sections.tsx`, `components/filters/filters-sidebar.tsx` |
| Data table columns | `lib/dashboard/table-column-preferences.ts` (`TABLE_COLUMNS`) |
| Detail dialogs | `components/dialogs/*.tsx` |
| Charts | `lib/dashboard/charts.ts`, `components/tabs/*-tab.tsx` |
| Summary cards and headcount rule | `components/dashboard/summary-cards.tsx`, `lib/dashboard/dashboard-core.ts` |
| Excel export | `lib/exports/server-builder.ts` |
| Table columns (DB) | `etl/importer/master-schema.json` |

The old `filter-column-ui-label-map.json` has moved to `documentation/archive/` and is not used by anything. Use `lib/config/filters.ts` instead.

---

## Table of Contents

- [1. Filters (Sidebar)](#1-filters-sidebar)
  - [1.1 Account Attributes](#11-account-attributes)
  - [1.2 Centre Attributes](#12-centre-attributes)
  - [1.3 Prospect Attributes](#13-prospect-attributes)
  - [1.4 Filter Types Reference](#14-filter-types-reference)
- [2. Data Tables](#2-data-tables)
  - [2.1 Accounts Table](#21-accounts-table)
  - [2.2 Centres Table](#22-centres-table)
  - [2.3 Prospects Table](#23-prospects-table)
  - [2.4 Services and Functions (not rendered)](#24-services-and-functions-not-rendered)
- [3. Detail Dialogs (Popups)](#3-detail-dialogs-popups)
  - [3.1 Account Details Dialog](#31-account-details-dialog)
  - [3.2 Centre Details Dialog](#32-centre-details-dialog)
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

The filter sidebar is on the left side of the dashboard. Filters are grouped into three collapsible sections: **Account Attributes**, **Centre Attributes** and **Prospect Attributes** (the config section ids are `accounts`, `centers`, `prospects`).

Each section can hide some filters behind a premium "Show More" reveal (`premiumFilterKeys` in `lib/config/filters.ts`). Filters with `enabled: false` are hidden and ignored by filtering (`sanitizeFilters` resets them to defaults).

**Source files:**
- `lib/config/filters.ts`
- `components/filters/filter-sections.tsx`
- `components/filters/filters-sidebar.tsx`
- `hooks/use-dashboard-filters.ts`
- SQL: `lib/dashboard/filtering-sql.ts`

### 1.1 Account Attributes

Rows are in config order. "Premium" means the filter sits behind "Show More".

| UI Label | Filter State Key | Database Column | Table | Filter Type | Notes |
|----------|-----------------|-----------------|-------|-------------|-------|
| Account Visibility | `accountVisibilityMode` | `account_visibility` | `accounts` | Single-select (`ALL`, `GCCs`, `NON-GCCs`) | Default is GCCs (`account_visibility = 'include'`). NON-GCCs matches `'exclude'`. Ignored while an account name search is active. |
| Account Name | `accountGlobalLegalNameKeywords` | `account_global_legal_name` | `accounts` | Keyword (autocomplete) | `AccountAutocomplete`, matches with `ILIKE '%kw%'` |
| Account List | `accountListValues` | `account_global_legal_name` | `accounts` | Multi-select | Uploaded client account lists (`AccountListPicker`) |
| Account List Accounts | `accountNameValues` | `account_global_legal_name` | `accounts` | Multi-select | Exact account names derived from the selected lists. No separate control: set together with Account List. |
| HQ Company Revenue | `accountHqRevenueRange` | `account_hq_revenue` | `accounts` | Range slider [min, max] | |
| Revenue: Include all | `accountHqRevenueIncludeNull` | `account_hq_revenue` | `accounts` | Boolean toggle | Shown as an "Include all" checkbox next to the revenue label |
| GCC Aggregate Headcount (India) | `accountCenterEmployeesRangeValues` | `account_center_employees_range` | `accounts` | Multi-select | |
| Years In India | `accountYearsInIndiaRange` | `years_in_india` | `accounts` | Range slider [min, max] | |
| Years In India: Include all | `yearsInIndiaIncludeNull` | `years_in_india` | `accounts` | Boolean toggle | |
| Industry | `accountPrimaryCategoryValues` | `account_primary_category` | `accounts` | Multi-select | |
| HQ Country | `accountHqCountryValues` | `account_hq_country` | `accounts` | Multi-select | |
| HQ Region | `accountHqRegionValues` | `account_hq_region` | `accounts` | Multi-select | Premium |
| HQ Employee Range | `accountHqEmployeeRangeValues` | `account_hq_employee_range` | `accounts` | Multi-select | Premium |
| Sub Industry | `accountHqIndustryValues` | `account_hq_industry` | `accounts` | Multi-select | Premium |
| Segment | `accountPrimaryNatureValues` | `account_primary_nature` | `accounts` | Multi-select | Premium |
| NASSCOM GCC Listing Status | `accountNasscomStatusValues` | `account_nasscom_status` | `accounts` | Multi-select | Premium |
| Source | `accountSourceValues` | `account_source` | `accounts` | Multi-select | Premium, `enabled: false` |
| Type | `accountTypeValues` | `account_type` | `accounts` | Multi-select | Premium, `enabled: false` |
| Coverage | `accountDataCoverageValues` | `account_data_coverage` | `accounts` | Multi-select | Premium, `enabled: false` |

> **Naming trap:** the UI label "Industry" maps to `account_primary_category`, and "Sub Industry" maps to `account_hq_industry`. The column `account_hq_sub_industry` is not filterable; it appears only in the Account dialog and in exports.

### 1.2 Centre Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type | Notes |
|----------|-----------------|-----------------|-------|-------------|-------|
| Status | `centerStatusValues` | `center_status` | `centers` | Multi-select | |
| Centre Type | `centerTypeValues` | `center_type` | `centers` | Multi-select | Config label is "Center Type"; sidebar renders "Centre Type" |
| Services Offered | `functionNameValues` | `function_name` | `functions` | Multi-select | Joined through `cn_unique_key` |
| City | `centerCityValues` | `center_city` | `centers` | Multi-select | |
| Incorporation Timeline | `centerIncYearRange` | `center_inc_year` | `centers` | Range slider [min, max] | |
| Incorporation Timeline: Include all | `centerIncYearIncludeNull` | `center_inc_year` | `centers` | Boolean toggle | |
| Centre Headcount | `centerEmployeesRangeValues` | `center_employees_range` | `centers` | Multi-select | Config label is "Center Headcount" |
| State | `centerStateValues` | `center_state` | `centers` | Multi-select | Premium |
| Centre Focus | `centerFocusValues` | `center_focus` | `centers` | Multi-select | Premium. Config label is "Center Focus" |
| Software In Use | `techSoftwareInUseKeywords` | `software_in_use` | `tech` | Keyword | Premium. Joined through `cn_unique_key`, matches with `ILIKE '%kw%'` |
| Country | `centerCountryValues` | `center_country` | `centers` | Multi-select | Premium, `enabled: false` |

### 1.3 Prospect Attributes

This section has no "Show More" gating.

| UI Label | Filter State Key | Database Column | Table | Filter Type | Notes |
|----------|-----------------|-----------------|-------|-------------|-------|
| Job Title | `prospectTitleKeywords` | `prospect_title` | `prospects` | Keyword | |
| Role | `prospectHeadTypeValues` | `head_type` | `prospects` | Multi-select | Values such as "GCC Head", "HR Head" |
| Seniority Level | `prospectLevelValues` | `prospect_level` | `prospects` | Multi-select | |
| Department | `prospectDepartmentValues` | `prospect_department` | `prospects` | Multi-select | |
| City | `prospectCityValues` | `prospect_city` | `prospects` | Multi-select | |
| Engaged | `prospectEngagedValues` | `prospect_engaged` | `prospects` | Multi-select | Whether the prospect has engaged with a Bamboo Reports campaign |

### 1.4 Filter Types Reference

| Filter Type | UI Control | Data Structure | Behavior |
|-------------|-----------|----------------|----------|
| **Multi-select** | `EnhancedMultiSelect` dropdown | `FilterValue[]` (`{ value: string, mode: 'include' \| 'exclude' }`) | Green badge = include, red badge = exclude. Options show the count of matching records. |
| **Keyword** | `TitleKeywordInput` (Account Name uses `AccountAutocomplete`) | `FilterValue[]` (`{ value: string, mode: 'include' \| 'exclude' }`) | A keyword is added on Enter. Matches partial strings with `ILIKE '%kw%'`. |
| **Range slider** | `Slider` with min/max handles and inputs | `[number, number]` tuple | Keeps records whose column value falls within the range. |
| **Boolean toggle** | "Include all" checkbox | `boolean` | When on, also keeps records where the column is NULL. |
| **Single-select** | Segmented control (`ACCOUNT_VISIBILITY_OPTIONS`) | `"all" \| "gcc" \| "nonGcc"` | Used only by Account Visibility. |

---

## 2. Data Tables

Each tab can show a paginated data table. Page size comes from `itemsPerPage` in `app/page.tsx` (currently 51) and is sent to the query routes, which clamp it to `MAX_PAGE_SIZE = 100` (`lib/dashboard/entity-query.ts`).

Column labels and which columns are user-hideable come from `TABLE_COLUMNS` in `lib/dashboard/table-column-preferences.ts` (`required: true` columns cannot be hidden; preferences are stored under the `br-table-columns:<dataset>` key). The tab components render the Centres labels with the British spelling.

### 2.1 Accounts Table

**Source files:** `components/tabs/accounts-tab.tsx`, `components/tables/account-row.tsx`

| Column Header | Column Key | Database Column | Table | Display Type | Notes |
|---------------|-----------|-----------------|-------|-------------|-------|
| *(Logo)* | | `account_hq_website` | `accounts` | Company logo | Brandfetch lookup by domain; falls back to a monogram |
| Account Name | `name` (required) | `account_global_legal_name` | `accounts` | Clickable text | Opens the Account Details dialog |
| *(NASSCOM chip)* | | `account_nasscom_status` | `accounts` | Chip | "NASSCOM" chip when the value is `yes` (case-insensitive) |
| *(Visibility note chip)* | | `account_visibility`, `account_visibility_note` | `accounts` | Chip | Shows the note when `account_visibility = 'exclude'` and a note exists |
| Sub Industry | `industry` | `account_hq_industry` | `accounts` | Text | |
| Revenue Range | `revenue` | `account_hq_revenue_range` | `accounts` | Text | Bucketed range string |
| GCC Aggregate Headcount (India) | `employees` | `account_center_employees_range` | `accounts` | Text | Bucketed range string |

### 2.2 Centres Table

**Source files:** `components/tabs/centers-tab.tsx`, `components/tables/center-row.tsx`

| Column Header | Column Key | Database Column | Table | Display Type | Notes |
|---------------|-----------|-----------------|-------|-------------|-------|
| *(Logo)* | | `center_account_website` | `centers` | Company logo | Brandfetch lookup by parent account domain |
| Centre Name | `name` (required) | `center_name` | `centers` | Clickable text | Opens the Centre Details dialog; second line shows `account_global_legal_name` |
| Location | `location` | `center_city` + `center_state` | `centers` | Computed text | `formatCenterLocation` ("City, State") |
| Centre Type | `type` | `center_type` | `centers` | Text | |
| Centre Headcount | `employees` | `center_employees_range` | `centers` | Text | Bucketed range string |

The row context menu also uses `center_website` and `center_linkedin`. `cn_unique_key` identifies rows.

### 2.3 Prospects Table

**Source files:** `components/tabs/prospects-tab.tsx`, `components/tables/prospect-row.tsx`

| Column Header | Column Key | Database Column | Table | Display Type | Notes |
|---------------|-----------|-----------------|-------|-------------|-------|
| *(Avatar)* | `avatar` (required) | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` | Initials badge | |
| Name | `name` (required) | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` | Clickable text | Opens the Prospect Details dialog; second line shows `account_global_legal_name` |
| Location | `location` | `prospect_city` + `prospect_state` + `prospect_country` | `prospects` | Computed text | `formatProspectLocation`: "City, State", falls back to country; `TBA` values are skipped |
| Job Title | `title` | `prospect_title` | `prospects` | Text | |
| Department | `department` | `prospect_department` | `prospects` | Text | |

The row context menu also uses `prospect_email` and `prospect_linkedin_url`. Row selection for export uses `ps_unique_key`.

### 2.4 Services and Functions (not rendered)

`components/tabs/services-tab.tsx` (`ServicesTab`), `components/tables/service-row.tsx` (`ServiceRow`) and `components/tables/function-row.tsx` (`FunctionRow`) are re-exported from their `index.ts` files but are not rendered anywhere in the app. Service data is shown only in the Centre Details dialog (section 3.2) and in the Services export sheet (section 8). Function data is used by the Services Offered filter and the Function chart.

---

## 3. Detail Dialogs (Popups)

Clicking a row, grid card or map entry opens a detail dialog. Most rows are hidden when the value is empty (`MetaRow` and `KPITile` skip nulls).

### 3.1 Account Details Dialog

**Source file:** `components/dialogs/account-details-tabbed-dialog.tsx`

A tabbed dialog with **Account Info**, **Centres** and **Prospects** tabs. The Centres and Prospects tabs appear only when the account has rows and the section is enabled. Related centres, prospects, services and tech load from the account-related API (`fetchAccountRelated` in `lib/dashboard/api-client.ts`) in server mode.

#### Header

| UI Element | Database Column | Table |
|------------|----------------|-------|
| Logo | `account_hq_website` | `accounts` |
| Title | `account_global_legal_name` | `accounts` |
| Website icon link | `account_hq_website` | `accounts` |
| LinkedIn icon link | `account_hq_linkedin_link` | `accounts` |
| Subtitle | `account_hq_city` + `account_hq_state` + `account_hq_country` (falls back to `account_hq_region`) | `accounts` |

#### Account Info Tab: Company Snapshot

| UI Label | Database Column | Table |
|----------|----------------|-------|
| About | `account_about` | `accounts` |
| Key Offerings | `account_hq_key_offerings` (one bullet per line) | `accounts` |
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
| Forbes 2000 Rank | `account_hq_forbes_2000_rank` (shown as `#N`) | `accounts` |
| Fortune 500 Rank | `account_hq_fortune_500_rank` (shown as `#N`) | `accounts` |

> The dialog labels `account_hq_industry` as "Industry", while the filter sidebar and accounts table label the same column "Sub Industry".

#### Account Info Tab: Scale & Financials

| UI Label | Data Source | Notes |
|----------|------------|-------|
| Revenue | `account_hq_revenue` (caption: `account_hq_revenue_range`) | Formatted in millions |
| Market Cap | `financialData.marketCap` | Caption: ticker and exchange. Shown only when financial data loaded. |
| Net Profit | `financialData.netProfit` | Same as above |
| Employees | `account_hq_employee_count` (caption: `account_hq_employee_range`) | |
| Annual Revenue (FY) chart | `financialData.annualRevenueSeries` | Array of `{ label, revenue }`, Recharts area chart |

Financial data is fetched on the client by `requestAccountFinancialInfo(ticker)` in `lib/finance/request-client.ts`, which calls the authenticated, rate-limited `/api/financials?ticker=...` route. It loads only when the account has a ticker and the Account Info tab is open. It replaces the former `getAccountFinancialInfo` server action.

#### Account Info Tab: India Presence

Shown when the Centres section is enabled and the account has any of these values or any centres.

| UI Label | Database Column | Table |
|----------|----------------|-------|
| First Centre | `account_first_center_year` | `accounts` |
| Years in India | `years_in_india` | `accounts` |
| Centre Employees | `account_center_employees` | `accounts` |
| GCC Aggregate Headcount (India) | `account_center_employees_range` | `accounts` |
| Primary City | `account_primary_city` | `accounts` |
| Hub Structure | `account_hub_structure` | `accounts` |
| Centres Map | `centers` rows of this account (`lat`, `lng`, see section 6.1) | `centers` |

#### Account Info Tab: Technology Stack

Tech treemap (section 4.2) over `tech` rows where `account_global_legal_name` matches.

#### Centres Tab

Quick filters: **Centre Type** (`center_type`) and **Headcount Range** (`center_employees_range`). Results are `CenterGridCard`s (`components/cards/center-grid-card.tsx`), 6 per page:

| Card Element | Database Column | Table |
|--------------|----------------|-------|
| Logo | `center_account_website` | `centers` |
| Name + status dot | `center_name`, `center_status` | `centers` |
| Account | `account_global_legal_name` | `centers` |
| Type | `center_type` | `centers` |
| Location | `center_city` + `center_state` | `centers` |
| Headcount | `center_employees_range` | `centers` |

#### Prospects Tab

Quick filters: **Head Type** (`head_type`), **Department** (`prospect_department`), **Level** (`prospect_level`). Results are `ProspectGridCard`s (`components/cards/prospect-grid-card.tsx`), 6 per page:

| Card Element | Database Column | Table |
|--------------|----------------|-------|
| Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` |
| Account | `account_global_legal_name` | `prospects` |
| GCC Head / HR Head badge | `head_type` | `prospects` |
| Location | `prospect_city` + `prospect_state` + `prospect_country` | `prospects` |
| Department | `prospect_department` | `prospects` |
| Level | `prospect_level` | `prospects` |

---

### 3.2 Centre Details Dialog

**Source file:** `components/dialogs/center-details-dialog.tsx`

In server mode, the centre's services and tech load from `/api/centers/[key]`.

#### Header

| UI Element | Database Column | Table |
|------------|----------------|-------|
| Breadcrumb | `account_global_legal_name` > `center_name` | `centers` |
| Logo | `center_account_website` | `centers` |
| Title | `center_name` | `centers` |
| Website / LinkedIn icon links | `center_website`, `center_linkedin` | `centers` |
| Status dot | `center_status` (Active Center, Upcoming, Non Operational) | `centers` |
| Account link | `account_global_legal_name` (opens the Account dialog) | `centers` |

#### Centre Snapshot

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Primary Services | `primary_service` (one bullet per line) | `services` |
| Focus Region | `focus_region` (one bullet per line) | `services` |
| Address | `center_address` | `centers` |
| Status | `center_status` ("Active Center" shown as "Active") | `centers` |
| Centre Type | `center_type` | `centers` |
| Centre Focus | `center_focus` | `centers` |
| Micro Location | `center_micro_location` | `centers` |
| Location | `center_city` + `center_state` | `centers` |
| Country | `center_country` (hidden when `TBA` or when Location is just "India") | `centers` |
| Zip Code | `center_zip_code` | `centers` |
| Boardline | `center_boardline` | `centers` |
| Management Partner | `center_management_partner` | `centers` |
| JV Status | `center_jv_status` | `centers` |
| JV Name | `center_jv_name` | `centers` |

#### Scale & Timeline

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Employees | `center_employees` (caption: `center_employees_range`) | `centers` |
| Incorporation Year | `center_inc_year` (caption: `center_timeline`) | `centers` |
| Announced | `announced_month` + `announced_year` | `centers` |
| End Year | `center_end_year` | `centers` |

#### Services Offered

Shown only when the centre has a `services` row with at least one non-empty category. Each category is a multi-line TEXT column rendered as one pill per line (`-` lines are skipped).

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

#### Technology Stack

Tech treemap (section 4.2) over `tech` rows where `cn_unique_key` matches.

---

### 3.3 Prospect Details Dialog

**Source files:** `components/dialogs/prospect-details-dialog.tsx`, `components/dialogs/prospect-engagement-timeline.tsx`

#### Header

| UI Element | Database Column | Table |
|------------|----------------|-------|
| Breadcrumb | `account_global_legal_name` > Prospects > name | `prospects` |
| Initials / Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` |
| Account link | `account_global_legal_name` (opens the Account dialog) | `prospects` |
| Email icon link | `prospect_email` | `prospects` |
| LinkedIn icon link | `prospect_linkedin_url` | `prospects` |
| GCC Head / HR Head badge | `head_type` | `prospects` |
| Engaged badge | `prospect_engaged` (shown when the value is `yes`) | `prospects` |

#### Profile

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Job Title | `prospect_title` | `prospects` |
| Email | `prospect_email` (with copy button) | `prospects` |
| Department | `prospect_department` | `prospects` |
| Level | `prospect_level` | `prospects` |
| In Company Since | `prospect_in_company_year` | `prospects` |
| Current Role Since | `prospect_current_year` | `prospects` |
| Centre | `center_name` | `prospects` |
| Location | `prospect_city` + `prospect_state` | `prospects` |
| Country | `prospect_country` (hidden when `TBA` or when Location is just "India") | `prospects` |

#### Bamboo Reports Activity

Shown only for engaged prospects with a `ps_unique_key`. Loaded from `/api/prospects/[id]/engagements`, which reads `subscribers` rows whose `prospect_email` matches the prospect.

| UI Element | Database Column | Table |
|------------|----------------|-------|
| Touchpoint date | `prospect_engaged_date` | `subscribers` |
| Touchpoint kind (Registration, Download, Snapshot, Campaign) and name | `prospect_engaged_campaign` | `subscribers` |

#### More Contacts From {account}

Other prospects of the same account, with quick filters **Head Type** (`head_type`), **Department** (`prospect_department`) and **Level** (`prospect_level`), shown as prospect grid cards.

---

## 4. Charts

### 4.1 Pie / Donut Charts

**Source files:** `lib/dashboard/charts.ts`, `lib/utils/chart-helpers.ts`, `components/charts/pie-chart-card.tsx`

Charts are Highcharts donuts (inner size 65%). Segments under 5% of the total (`OTHERS_THRESHOLD_PERCENT`) are grouped into "Others". The helpers keep the top 10 values by default (`calculateCityChartData` keeps the top 5 plus "Others").

#### Account Charts (Accounts tab, `getAccountChartData`)

| Chart Title | Data Key | Database Column | Table | Helper |
|-------------|----------|----------------|-------|--------|
| Country | `regionData` | `account_hq_country` | `accounts` | `calculateChartData` |
| Industry | `primaryNatureData` | `account_primary_category` | `accounts` | `calculateChartData` |
| Revenue Range | `revenueRangeData` | `account_hq_revenue_range` | `accounts` | `calculateChartData` |
| GCC Aggregate Headcount (India) | `employeesRangeData` | `account_center_employees_range` | `accounts` | `calculateChartData` |

#### Centre Charts (Centres tab, "Centre Analytics", `getCenterChartData`)

| Chart Title | Data Key | Database Column | Table | Helper |
|-------------|----------|----------------|-------|--------|
| Centre Type | `centerTypeData` | `center_type` | `centers` | `calculateCenterChartData` |
| Centre Headcount | `employeesRangeData` | `center_employees_range` | `centers` | `calculateCenterChartData` |
| City | `cityData` | `center_city` | `centers` | `calculateCityChartData` (top 5 + Others) |
| Function | `functionData` | `function_name` | `functions` | `calculateFunctionChartData` (only functions of the visible `cn_unique_key` set) |

#### Prospect Charts (Prospects tab, `getProspectChartData`)

| Chart Title | Data Key | Database Column | Table | Helper |
|-------------|----------|----------------|-------|--------|
| Department | `departmentData` | `prospect_department` | `prospects` | `calculateChartData` |
| Level | `levelData` | `prospect_level` | `prospects` | `calculateChartData` |

`getProspectChartData` also computes `cityData` (`prospect_city`), but the Prospects tab does not render it.

`getReportChartData` builds the same series uncapped for the summary PDF (no prospect city series).

### 4.2 Tech Treemap

**Source file:** `components/charts/tech-treemap.tsx`

A Highcharts treemap with a two-level hierarchy, rendered in the Technology Stack section of the Account and Centre dialogs.

| Level | Database Column | Table | Description |
|-------|----------------|-------|-------------|
| Level 1 (Parent) | `software_category` (empty becomes "Uncategorized") | `tech` | Category |
| Level 2 (Child) | `software_in_use` (empty becomes "Unknown") | `tech` | Individual software within the category |

**Scoping:** by `account_global_legal_name` in the Account dialog, by `cn_unique_key` in the Centre dialog.

---

## 5. Summary Cards

**Source files:** `components/dashboard/summary-cards.tsx`, `lib/dashboard/dashboard-core.ts` (`computeSummary`)

Five cards at the top of the dashboard show filtered vs. total values. The counts are computed in SQL by `computeSummary`.

| Card Title | Filtered Value | Total Value | Clickable |
|------------|----------------|-------------|-----------|
| Accounts | `count(*)` of filtered `accounts` | `count(*)` of `accounts` | Yes |
| Centres | `count(*)` of filtered `centers` | `count(*)` of `centers` | Yes |
| Upcoming Centres | Filtered centres with `center_status = 'Upcoming'` | All centres with `center_status = 'Upcoming'` | No (overview stat) |
| Prospects | `count(*)` of filtered `prospects` | `count(*)` of `prospects` | Yes |
| Headcount | Sum of `center_employees` over filtered centres | Same over all centres | No (overview stat) |

**Headcount rule:** centres whose `center_type` (lowercased) is `manufacturing`, `sales & marketing`, `bpo` or `distribution` are excluded from the sum. Centres with a NULL `center_type` are included. See `CENTER_METRICS` in `lib/dashboard/dashboard-core.ts`.

**Display format:** each card shows the filtered value and the total. In compact mode (narrow cards), numbers use K/M notation truncated to one decimal.

---

## 6. Maps

The Centres tab and (when `canAccessAccountsMapView()` allows it) the Accounts tab have a map view with a cluster map and a state choropleth. In server mode the aggregates arrive pre-computed (`cities`, `states` props).

### 6.1 Cluster Map

**Source file:** `components/maps/centers-map.tsx`

Centres are grouped by `center_city` into MapLibre cluster markers. Centres without `lat`/`lng` or city are skipped.

| Data Field | Database Column | Table | Usage |
|------------|----------------|-------|-------|
| Latitude / Longitude | `lat`, `lng` | `centers` | Marker position |
| City | `center_city` | `centers` | Cluster key and label |
| Country | `center_country` | `centers` | Cluster label |
| Centre count | `count(*)` per city | `centers` | Tooltip |
| Accounts count | distinct `account_global_legal_name` per city | `centers` | Tooltip |
| Headcount | sum of `center_employees` per city | `centers` | Tooltip |

### 6.2 State Choropleth Map

**Source file:** `components/maps/centers-choropleth-map.tsx`

| Metric | Database Columns | Aggregation |
|--------|-----------------|-------------|
| Centre Count | `center_state`, `center_country_iso2` | Count per state |
| Distinct Accounts | `account_global_legal_name` | Distinct count per state |
| Headcount | `center_employees` | Sum per state |

**Boundary matching:** centres are matched to GeoJSON features by `center_country_iso2` + `center_state`; `center_country` provides the country display name. See `documentation/frontend/map-disputed-boundaries.md`.

---

## 7. Notifications

**Source files:** `hooks/use-notifications.ts`, `app/actions/notifications.ts`, `components/notifications/notification-dropdown.tsx`

Only changes to `accounts`, `centers` and `prospects` are shown (`UI_VISIBLE_NOTIFICATION_TABLES`).

| UI Element | Server Action | Database Tables | Description |
|------------|---------------|-----------------|-------------|
| Notification bell (unread count) | `getUnreadCount` | `audit.field_change_events`, `audit.user_notification_state` | Distinct changed records with `changed_at` after the user's `last_read_at` |
| Activity dropdown summaries | `getUnreadSummaries` | Same | Grouped by `table_name` and change type |
| Record list | `getUnreadRecordSummaries` | Same | One row per record (`record_uuid`, else `record_identity`, else `record_label`) |
| Mark all as read | `markAllAsRead` | `audit.user_notification_state` | Upserts `last_read_at` for the user |

---

## 8. Export (Excel)

**Source files:** `lib/exports/server-builder.ts` (`buildServerExport`), `app/api/exports/generate/route.ts`, `components/export/export-dialog.tsx`, `components/exports/exports-dialog.tsx`

The export is built on the server with ExcelJS. Each sheet is a `SELECT *` of its table (all rows, or rows limited by the current filters, the selected accounts, the selected centre keys or the selected `ps_unique_key`s). **Column headers are the raw database column names**: there is no friendly-name mapping. The column set is every key present in the returned rows, in first-seen order. `account_hq_revenue` is normalized from BigInt/string to a number.

| Sheet | Table | Row source |
|-------|-------|-----------|
| Accounts | `accounts` | `SELECT *` |
| Centres | `centers` | `SELECT *` |
| Services | `services` | `SELECT *` of rows whose `cn_unique_key` belongs to the exported centres |
| Prospects | `prospects` | `SELECT *` |

For the full column list of each sheet, see `etl/importer/master-schema.json`.

> **Access:** export is restricted to the `admin` role (`canExportData()` in `lib/auth/roles.ts`, enforced in `app/api/exports/generate/route.ts`), with a rolling per-user rate limit backed by the `user_exports` table.

---

## Column Quick Reference

Columns referenced by the UI, by table. "Export" is omitted: every column of `accounts`, `centers`, `services` and `prospects` is exported.

### `accounts` table

| Column | Used In |
|--------|---------|
| `account_about` | Account dialog (Snapshot) |
| `account_center_employees` | Account dialog (India Presence) |
| `account_center_employees_range` | Filter, Accounts table, Account dialog, Charts |
| `account_data_coverage` | Filter (disabled) |
| `account_first_center_year` | Account dialog (India Presence) |
| `account_global_legal_name` | Filters (Account Name, Account List), Accounts table, all dialogs, Tech treemap scoping |
| `account_hq_city` | Account dialog (header, HQ Location) |
| `account_hq_company_type` | Account dialog (Account Type) |
| `account_hq_country` | Filter (HQ Country), Account dialog, Charts |
| `account_hq_employee_count` | Account dialog (Scale & Financials) |
| `account_hq_employee_range` | Filter (premium), Account dialog |
| `account_hq_forbes_2000_rank` | Account dialog (Forbes 2000 Rank) |
| `account_hq_fortune_500_rank` | Account dialog (Fortune 500 Rank) |
| `account_hq_industry` | Filter (Sub Industry), Accounts table (Sub Industry), Account dialog (Industry) |
| `account_hq_key_offerings` | Account dialog (Snapshot) |
| `account_hq_linkedin_link` | Account dialog (header) |
| `account_hq_region` | Filter (HQ Region, premium), Account dialog |
| `account_hq_revenue` | Filter (range), Account dialog (Revenue) |
| `account_hq_revenue_range` | Accounts table, Account dialog, Charts |
| `account_hq_state` | Account dialog (header, HQ Location) |
| `account_hq_stock_ticker` | Account dialog (Stock Ticker, financials lookup). Lives in the `ticker` table, merged onto accounts server-side |
| `account_hq_sub_industry` | Account dialog (Sub Industry) |
| `account_hq_website` | Accounts table (logo), Account dialog (logo, header link) |
| `account_hub_structure` | Account dialog (India Presence) |
| `account_nasscom_status` | Filter (premium), Accounts table (chip), Account dialog |
| `account_primary_category` | Filter (Industry), Account dialog, Charts (Industry) |
| `account_primary_city` | Account dialog (India Presence) |
| `account_primary_nature` | Filter (Segment, premium), Account dialog |
| `account_source` | Filter (disabled) |
| `account_type` | Filter (disabled) |
| `account_visibility` | Filter (Account Visibility), Accounts table (chip) |
| `account_visibility_note` | Accounts table (chip) |
| `years_in_india` | Filter (range), Account dialog (India Presence) |

### `centers` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Centres table, Centre dialog, Maps |
| `announced_month` | Centre dialog (Announced) |
| `announced_year` | Centre dialog (Announced) |
| `center_account_website` | Centres table (logo), Centre dialog (logo), grid cards |
| `center_address` | Centre dialog (Snapshot) |
| `center_boardline` | Centre dialog (Boardline) |
| `center_city` | Filter, Centres table, Centre dialog, Charts (City), Cluster map |
| `center_country` | Filter (disabled), Centre dialog, Maps |
| `center_country_iso2` | Choropleth map (boundary matching) |
| `center_employees` | Summary cards (Headcount), Centre dialog, Maps |
| `center_employees_range` | Filter, Centres table, Centre dialog, Charts, grid cards |
| `center_end_year` | Centre dialog (End Year) |
| `center_focus` | Filter (premium), Centre dialog |
| `center_inc_year` | Filter (range), Centre dialog |
| `center_jv_name` | Centre dialog |
| `center_jv_status` | Centre dialog |
| `center_linkedin` | Centre dialog (header), row context menu |
| `center_management_partner` | Centre dialog |
| `center_micro_location` | Centre dialog |
| `center_name` | Centres table, Centre dialog, grid cards |
| `center_state` | Filter (premium), Centres table, Centre dialog, Choropleth map |
| `center_status` | Filter, Summary cards (Upcoming Centres), Centre dialog, grid cards |
| `center_timeline` | Centre dialog (Incorporation Year caption) |
| `center_type` | Filter, Centres table, Centre dialog, Charts, Summary cards (headcount exclusion) |
| `center_website` | Centre dialog (header), row context menu |
| `center_zip_code` | Centre dialog |
| `cn_unique_key` | Row identity, join key for `services`, `functions`, `tech` |
| `lat`, `lng` | Cluster map |

### `services` table

| Column | Used In |
|--------|---------|
| `cn_unique_key` | Join to the centre |
| `primary_service` | Centre dialog (Primary Services) |
| `focus_region` | Centre dialog (Focus Region) |
| `service_it`, `service_ai`, `service_erd`, `service_fna`, `service_hr`, `service_procurement`, `service_sales_marketing`, `service_customer_support`, `service_others` | Centre dialog (Services Offered) |

### `functions` table

| Column | Used In |
|--------|---------|
| `cn_unique_key` | Filter join, Function chart scoping |
| `function_name` | Filter (Services Offered), Charts (Function) |

### `tech` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Tech treemap scoping (Account dialog) |
| `cn_unique_key` | Filter join, Tech treemap scoping (Centre dialog) |
| `software_category` | Tech treemap (Level 1) |
| `software_in_use` | Filter (Software In Use), Tech treemap (Level 2) |

### `prospects` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Prospects table, Prospect dialog, Account dialog (Prospects tab) |
| `center_name` | Prospect dialog (Centre) |
| `head_type` | Filter (Role), Prospect dialog and grid card badges, quick filters (Head Type) |
| `prospect_city` | Filter, Prospects table, Prospect dialog |
| `prospect_country` | Prospects table (fallback), Prospect dialog |
| `prospect_current_year` | Prospect dialog (Current Role Since) |
| `prospect_department` | Filter, Prospects table, Prospect dialog, Charts |
| `prospect_email` | Prospect dialog, row context menu, engagement lookup |
| `prospect_engaged` | Filter (Engaged), Prospect dialog (Engaged badge) |
| `prospect_first_name`, `prospect_last_name` | Name fallback, avatar initials |
| `prospect_full_name` | Prospects table, Prospect dialog |
| `prospect_in_company_year` | Prospect dialog (In Company Since) |
| `prospect_level` | Filter (Seniority Level), Prospect dialog, Charts (Level) |
| `prospect_linkedin_url` | Prospect dialog, row context menu |
| `prospect_state` | Prospects table, Prospect dialog |
| `prospect_title` | Filter (Job Title), Prospects table, Prospect dialog |
| `ps_unique_key` | Row selection for export, engagement timeline |

### `subscribers` table

| Column | Used In |
|--------|---------|
| `prospect_email` | Engagement lookup (matched to the prospect) |
| `prospect_engaged_date` | Prospect dialog (Bamboo Reports Activity) |
| `prospect_engaged_campaign` | Prospect dialog (Bamboo Reports Activity) |

### Audit tables

| Table | Used In |
|-------|---------|
| `audit.field_change_events` | Notifications |
| `audit.user_notification_state` | Notification unread state (`last_read_at`) |
| `audit.import_runs` | ETL import tracking (no UI) |
