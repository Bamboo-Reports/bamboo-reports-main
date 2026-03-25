# UI-to-Database Column Mapping

A complete reference mapping every user-facing label in the application to its source database column. This document covers filters, data tables, detail dialogs, charts, and summary cards.

> **Last Updated:** March 2026
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
  - [2.4 Services Table](#24-services-table)
  - [2.5 Functions Table](#25-functions-table)
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

The filter sidebar is located on the left side of the dashboard. Filters are grouped into three collapsible sections: Account Attributes, Center Attributes, and Prospect Attributes.

**Source files:**
- `components/filters/filter-sections.tsx`
- `components/filters/filters-sidebar.tsx`
- `hooks/use-dashboard-filters.ts`

### 1.1 Account Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Account Name | `accountGlobalLegalNameKeywords` | `account_global_legal_name` | `accounts` | Keyword (include/exclude) |
| Region | `accountHqRegionValues` | `account_hq_region` | `accounts` | Multi-select (include/exclude) |
| Country | `accountHqCountryValues` | `account_hq_country` | `accounts` | Multi-select (include/exclude) |
| Segment | `accountPrimaryNatureValues` | `account_primary_nature` | `accounts` | Multi-select (include/exclude) |
| Category | `accountPrimaryCategoryValues` | `account_primary_category` | `accounts` | Multi-select (include/exclude) |
| Industry | `accountHqIndustryValues` | `account_hq_industry` | `accounts` | Multi-select (include/exclude) |
| Type | `accountTypeValues` | `account_type` | `accounts` | Multi-select (include/exclude) |
| NASSCOM Status | `accountNasscomStatusValues` | `account_nasscom_status` | `accounts` | Multi-select (include/exclude) |
| Source | `accountSourceValues` | `account_source` | `accounts` | Multi-select (include/exclude) |
| Coverage | `accountDataCoverageValues` | `account_data_coverage` | `accounts` | Multi-select (include/exclude) |
| Employee Range | `accountHqEmployeeRangeValues` | `account_hq_employee_range` | `accounts` | Multi-select (include/exclude) |
| Aggregate India Headcount | `accountCenterEmployeesRangeValues` | `account_center_employees_range` | `accounts` | Multi-select (include/exclude) |
| Revenue (USDMn) | `accountHqRevenueRange` | `account_hq_revenue` | `accounts` | Range slider [min, max] |
| Revenue — "Include all" toggle | `accountHqRevenueIncludeNull` | `account_hq_revenue` | `accounts` | Boolean toggle (include NULLs) |
| Years In India | `accountYearsInIndiaRange` | `years_in_india` | `accounts` | Range slider [min, max] |
| Years In India — "Include all" toggle | `yearsInIndiaIncludeNull` | `years_in_india` | `accounts` | Boolean toggle (include NULLs) |

### 1.2 Center Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Status | `centerStatusValues` | `center_status` | `centers` | Multi-select (include/exclude) |
| Country | `centerCountryValues` | `center_country` | `centers` | Multi-select (include/exclude) |
| State | `centerStateValues` | `center_state` | `centers` | Multi-select (include/exclude) |
| City | `centerCityValues` | `center_city` | `centers` | Multi-select (include/exclude) |
| Focus | `centerFocusValues` | `center_focus` | `centers` | Multi-select (include/exclude) |
| Type | `centerTypeValues` | `center_type` | `centers` | Multi-select (include/exclude) |
| Center Headcount | `centerEmployeesRangeValues` | `center_employees_range` | `centers` | Multi-select (include/exclude) |
| Incorporation Timeline | `centerIncYearRange` | `center_inc_year` | `centers` | Range slider [min, max] |
| Incorporation Timeline — "Include all" toggle | `centerIncYearIncludeNull` | `center_inc_year` | `centers` | Boolean toggle (include NULLs) |
| Services Offered | `functionNameValues` | `function_name` | `functions` | Multi-select (include/exclude) |
| Software In Use | `techSoftwareInUseKeywords` | `software_in_use` | `tech` | Keyword (include/exclude) |

> **Note:** "Services Offered" filters via the `functions` table joined through `cn_unique_key`. "Software In Use" filters via the `tech` table joined through `cn_unique_key`.

### 1.3 Prospect Attributes

| UI Label | Filter State Key | Database Column | Table | Filter Type |
|----------|-----------------|-----------------|-------|-------------|
| Department | `prospectDepartmentValues` | `prospect_department` | `prospects` | Multi-select (include/exclude) |
| Seniority Level | `prospectLevelValues` | `prospect_level` | `prospects` | Multi-select (include/exclude) |
| City | `prospectCityValues` | `prospect_city` | `prospects` | Multi-select (include/exclude) |
| Job Title | `prospectTitleKeywords` | `prospect_title` | `prospects` | Keyword (include/exclude) |

### 1.4 Filter Types Reference

| Filter Type | UI Control | Data Structure | Behavior |
|-------------|-----------|----------------|----------|
| **Multi-select (include/exclude)** | `EnhancedMultiSelect` dropdown | `FilterValue[]` — `{ value: string, mode: 'include' \| 'exclude' }` | Green badge = include, Red badge = exclude. Options show count of matching records. |
| **Keyword (include/exclude)** | `TitleKeywordInput` text field | `FilterValue[]` — `{ value: string, mode: 'include' \| 'exclude' }` | Free-text entry with 300ms debounce. Matches partial strings in the target column. |
| **Range slider** | `Slider` with min/max handles | `[number, number]` tuple | Logarithmic scaling for revenue. Linear for years. Filters records where column value falls within range. |
| **Boolean toggle** | Checkbox | `boolean` | When enabled, includes records where the column value is NULL (no data). |

---

## 2. Data Tables

Each tab in the dashboard displays a paginated data table. Tables show 50 rows per page.

### 2.1 Accounts Table

**Source files:** `components/tabs/accounts-tab.tsx`, `components/tables/account-row.tsx`

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Logo)* | `account_hq_website` | `accounts` | Company logo image | Logo.dev lookup by domain; falls back to building icon |
| Account Name | `account_global_legal_name` | `accounts` | Clickable text | Opens Account Details dialog on click |
| *(NASSCOM badge)* | `account_nasscom_status` | `accounts` | Badge | Shows green "NASSCOM" badge when value is `"yes"` |
| Industry | `account_hq_industry` | `accounts` | Text | — |
| Revenue Range | `account_hq_revenue_range` | `accounts` | Text | Bucketed range string (e.g., "$1B-$5B") |
| Aggregate India Headcount | `account_center_employees_range` | `accounts` | Text | Bucketed range string (e.g., "1,001-5,000") |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Location | `account_hq_city`, `account_hq_country` | Displayed in some contexts |
| UUID | `uuid` | Recently-updated tracking |

### 2.2 Centers Table

**Source files:** `components/tabs/centers-tab.tsx`, `components/tables/center-row.tsx`

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Logo)* | `center_account_website` | `centers` | Company logo image | Logo.dev lookup by parent account domain |
| Center Name | `center_name` | `centers` | Clickable text | Opens Center Details dialog on click |
| Location | `center_city` + `center_country` | `centers` | Computed text | Format: "City, Country" |
| Center Type | `center_type` | `centers` | Text | — |
| Center Headcount | `center_employees_range` | `centers` | Text | Bucketed range string |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Account Name | `account_global_legal_name` | Linking to parent account |
| Unique Key | `cn_unique_key` | Row identification |
| UUID | `uuid` | Recently-updated tracking |

### 2.3 Prospects Table

**Source files:** `components/tabs/prospects-tab.tsx`, `components/tables/prospect-row.tsx`

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| *(Avatar)* | `prospect_first_name`, `prospect_last_name` | `prospects` | Initials badge | Colored circle with first letters of first + last name |
| Name | `prospect_full_name` or `prospect_first_name` + `prospect_last_name` | `prospects` | Clickable text | Opens Prospect Details dialog on click |
| Location | `prospect_city` + `prospect_country` | `prospects` | Computed text | Format: "City, Country" |
| Job Title | `prospect_title` | `prospects` | Text | — |
| Department | `prospect_department` | `prospects` | Text | — |

**Hidden fields used internally:**
| Field | Database Column | Purpose |
|-------|----------------|---------|
| Email | `prospect_email` | Unique identification |
| UUID | `uuid` | Recently-updated tracking |
| Account | `account_global_legal_name` | Linking to parent account |

### 2.4 Services Table

**Source files:** `components/tabs/services-tab.tsx`, `components/tables/service-row.tsx`

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| CN Unique Key | `cn_unique_key` | `services` | Muted text | Identifier linking to parent center |
| Center Name | `center_name` | `services` | Text | Denormalized from `centers` table |
| Primary Service | `primary_service` | `services` | Text | — |
| Focus Region | `focus_region` | `services` | Text | — |
| IT | `service_it` | `services` | Boolean indicator | Service capability flag |
| ER&D | `service_erd` | `services` | Boolean indicator | Service capability flag |
| FnA | `service_fna` | `services` | Boolean indicator | Service capability flag |
| HR | `service_hr` | `services` | Boolean indicator | Service capability flag |
| Procurement | `service_procurement` | `services` | Boolean indicator | Service capability flag |
| Sales & Marketing | `service_sales_marketing` | `services` | Boolean indicator | Service capability flag |
| Customer Support | `service_customer_support` | `services` | Boolean indicator | Service capability flag |
| Others | `service_others` | `services` | Boolean indicator | Service capability flag |
| Software Vendor | `software_vendor` | `services` | Text | — |
| Software In Use | `software_in_use` | `services` | Text | — |

### 2.5 Functions Table

**Source file:** `components/tables/function-row.tsx`

| Column Header | Database Column | Table | Display Type | Notes |
|---------------|----------------|-------|-------------|-------|
| CN Unique Key | `cn_unique_key` | `functions` | Muted text | Identifier linking to parent center |
| Function Name | `function_name` | `functions` | Text | — |

---

## 3. Detail Dialogs (Popups)

Clicking a row in any data table opens a detail dialog with comprehensive information about that entity.

### 3.1 Account Details Dialog

**Source file:** `components/dialogs/account-details-tabbed-dialog.tsx`

This is a tabbed dialog with three tabs: **Account Info**, **Centers**, and **Prospects**.

#### Account Info Tab

**Company Overview Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Account Type | `account_hq_company_type` | `accounts` |
| HQ Stock Ticker | `account_hq_stock_ticker` | `accounts` |
| About | `account_about` | `accounts` |
| Key Offerings | `account_hq_key_offerings` | `accounts` |

**Location Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Location | `account_hq_city` + `account_hq_country` | `accounts` |
| Region | `account_hq_region` | `accounts` |

**Industry Information Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Industry | `account_hq_industry` | `accounts` |
| Sub Industry | `account_hq_sub_industry` | `accounts` |
| Primary Category | `account_primary_category` | `accounts` |
| Primary Nature | `account_primary_nature` | `accounts` |

**Business Metrics Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Revenue (in Millions) | `account_hq_revenue` | `accounts` |
| Revenue Range | `account_hq_revenue_range` | `accounts` |
| Total Employees | `account_hq_employee_count` | `accounts` |
| Employees Range | `account_hq_employee_range` | `accounts` |
| Total Center Employees | `account_center_employees` | `accounts` |
| Aggregate India Headcount | `account_center_employees_range` | `accounts` |

**Financials Section** *(loaded via `getAccountFinancialInfo` server action — Yahoo Finance API):*

| UI Label | Data Source | Notes |
|----------|------------|-------|
| Stock Ticker | `financialData.inputTicker` | From `account_hq_stock_ticker` |
| Exchange | `financialData.exchange` | Yahoo Finance API |
| Market Cap | `financialData.marketCap` | Yahoo Finance API |
| Net Profit | `financialData.netProfit` | Yahoo Finance API |
| Annual Revenue (FY) chart | `financialData.annualRevenueSeries` | Array of `{ label, revenue }` — bar chart |

**Rankings & Recognition Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Forbes Ranking | `account_hq_forbes_2000_rank` | `accounts` |
| Fortune Ranking | `account_hq_fortune_500_rank` | `accounts` |
| NASSCOM Status | `account_nasscom_status` | `accounts` |

**India Operations Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| First Center Established | `account_first_center_year` | `accounts` |
| Years in India | `years_in_india` | `accounts` |

**Links Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Website | `account_hq_website` | `accounts` |
| LinkedIn | `account_hq_linkedin_link` | `accounts` |

**Embedded Visualizations:**

| Visualization | Data Source | Description |
|---------------|------------|-------------|
| Tech Treemap | `tech` table (filtered by `account_global_legal_name`) | Treemap of software tools grouped by `software_category` |
| Centers Map | `centers` table (filtered by `account_global_legal_name`) | Map showing center locations using `lat`, `lng` |

#### Centers Tab (within Account Dialog)

Shows a list of centers belonging to this account, each displaying:

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Center Name | `center_name` | `centers` |
| Status | `center_status` | `centers` |
| Location | `center_city` + `center_state` | `centers` |
| Type | `center_type` | `centers` |
| Headcount | `center_employees_range` | `centers` |

#### Prospects Tab (within Account Dialog)

Shows a list of prospects/contacts for this account, each displaying:

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Name | `prospect_first_name` + `prospect_last_name` | `prospects` |
| Job Title | `prospect_title` | `prospects` |
| Department | `prospect_department` | `prospects` |
| Seniority Level | `prospect_level` | `prospects` |
| Center | `center_name` | `prospects` |

---

### 3.2 Center Details Dialog

**Source file:** `components/dialogs/center-details-dialog.tsx`

**Header:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Center Name | `center_name` | `centers` |
| Account Name | `account_global_legal_name` | `centers` |
| Status | `center_status` | `centers` |

**Center Information Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Center Type | `center_type` | `centers` |
| Center Focus | `center_focus` | `centers` |
| Incorporation Year | `center_inc_year` | `centers` |
| Employees | `center_employees` | `centers` |
| Center Headcount | `center_employees_range` | `centers` |
| Boardline Number | `center_boardline` | `centers` |
| End Year | `center_end_year` | `centers` |
| Announced Year | `announced_year` | `centers` |
| Announced Month | `announced_month` | `centers` |

**Location Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Address | `center_address` | `centers` |
| City | `center_city` | `centers` |
| State | `center_state` | `centers` |
| Country | `center_country` | `centers` |
| Region | `center_region` | `centers` |
| Zip Code | `center_zip_code` | `centers` |

**Business Information Section** *(conditional — shown only if data exists):*

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Business Segment | `center_business_segment` | `centers` |
| Business Sub-Segment | `center_business_sub_segment` | `centers` |
| Management Partner | `center_management_partner` | `centers` |
| JV Status | `center_jv_status` | `centers` |
| JV Name | `center_jv_name` | `centers` |

**Services Offered Section** *(conditional — shown only if service data exists):*

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Primary Service | `primary_service` | `services` |
| Focus Region | `focus_region` | `services` |
| IT Services | `service_it` | `services` |
| ER&D Services | `service_erd` | `services` |
| Finance & Accounting | `service_fna` | `services` |
| HR Services | `service_hr` | `services` |
| Procurement | `service_procurement` | `services` |
| Sales & Marketing | `service_sales_marketing` | `services` |
| Customer Support | `service_customer_support` | `services` |
| Other Services | `service_others` | `services` |

**Links Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Website | `center_website` | `centers` |
| LinkedIn | `center_linkedin` | `centers` |

---

### 3.3 Prospect Details Dialog

**Source file:** `components/dialogs/prospect-details-dialog.tsx`

**Header:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Name | `prospect_first_name` + `prospect_last_name` | `prospects` |

**Contact Information Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Email | `prospect_email` | `prospects` |
| LinkedIn Profile | `prospect_linkedin_url` | `prospects` |

**Professional Information Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Job Title | `prospect_title` | `prospects` |
| Department | `prospect_department` | `prospects` |
| Level | `prospect_level` | `prospects` |

**Company Information Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Account Name | `account_global_legal_name` | `prospects` |
| Center Name | `center_name` | `prospects` |

**Location Section:**

| UI Label | Database Column | Table |
|----------|----------------|-------|
| Location | `prospect_city` + `prospect_state` + `prospect_country` | `prospects` |

---

## 4. Charts

### 4.1 Pie / Donut Charts

**Source files:** `components/charts/pie-chart-card.tsx`, `lib/utils/chart-helpers.ts`

Pie charts are rendered using Highcharts as donut charts (inner radius 65%). Segments under 5% of the total are grouped into an "Others" category.

#### Account Charts

These charts use the `calculateChartData(accounts, field)` helper which counts occurrences of each unique value in the specified column and returns the top 10 entries.

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Region | `account_hq_region` | `accounts` | Count of accounts per region |
| Country | `account_hq_country` | `accounts` | Count of accounts per country |
| Industry | `account_hq_industry` | `accounts` | Count of accounts per industry |
| Segment | `account_primary_nature` | `accounts` | Count of accounts per segment |
| Category | `account_primary_category` | `accounts` | Count of accounts per category |
| Revenue Range | `account_hq_revenue_range` | `accounts` | Count of accounts per revenue bucket |
| Employee Range | `account_hq_employee_range` | `accounts` | Count of accounts per employee bucket |
| Aggregate India Headcount | `account_center_employees_range` | `accounts` | Count of accounts per headcount bucket |
| NASSCOM Status | `account_nasscom_status` | `accounts` | Count of accounts per status |

#### Center Charts

These charts use the `calculateCenterChartData(centers, field)` helper with the same top-10 counting logic.

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Center Type | `center_type` | `centers` | Count of centers per type |
| Center Focus | `center_focus` | `centers` | Count of centers per focus |
| Center Status | `center_status` | `centers` | Count of centers per status |
| Center Headcount | `center_employees_range` | `centers` | Count of centers per headcount bucket |
| Country | `center_country` | `centers` | Count of centers per country |
| State | `center_state` | `centers` | Count of centers per state |

#### City Distribution Chart

Uses `calculateCityChartData(centers)` — a specialized helper that returns the top 5 cities by center count and groups the rest as "Others".

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| City Distribution | `center_city` | `centers` | Top 5 cities + "Others" bucket |

#### Function Distribution Chart

Uses `calculateFunctionChartData(functions, centerKeys)` — filters functions by the currently visible center keys, then counts each `function_name`.

| Chart Title | Database Column | Table | Aggregation |
|-------------|----------------|-------|-------------|
| Functions | `function_name` | `functions` | Count per function (filtered by visible `cn_unique_key` set) |

### 4.2 Tech Treemap

**Source file:** `components/charts/tech-treemap.tsx`

A Highcharts treemap with a two-level hierarchy. Rendered inside the Account Details dialog.

| Level | Database Column | Table | Description |
|-------|----------------|-------|-------------|
| Level 1 (Parent) | `software_category` | `tech` | Groups software tools into categories |
| Level 2 (Child) | `software_in_use` | `tech` | Individual software tools within each category |

**Aggregation:** Counts occurrences of each `software_in_use` within its `software_category`. Treemap tile size represents relative count. Color is assigned per category.

**Filtering:** The treemap is scoped to the current account via `account_global_legal_name`.

---

## 5. Summary Cards

**Source file:** `components/dashboard/summary-cards.tsx`

The summary cards appear at the top of the dashboard showing filtered vs. total counts.

| Card Title | Filtered Value Source | Total Value Source | Description |
|------------|----------------------|--------------------|--------------------|
| Accounts | Count of filtered `accounts` array | Count of all `accounts` array | Number of account entities matching current filters |
| Centers | Count of filtered `centers` array | Count of all `centers` array | Number of center entities matching current filters |
| Prospects | Count of filtered `prospects` array | Count of all `prospects` array | Number of prospect entities matching current filters |
| Headcount | Sum of `center_employees` from filtered centers | Sum of `center_employees` from all centers | Aggregate employee headcount across visible centers |

**Display format:** Each card shows "X of Y" where X is the filtered count (animated) and Y is the total count. In compact mode (sidebar open), large numbers use K/M notation.

---

## 6. Maps

### 6.1 Cluster Map

**Source file:** `components/maps/centers-map.tsx`

Renders center locations as clustered markers on an interactive MapLibre map.

| Data Field | Database Column | Table | Usage |
|------------|----------------|-------|-------|
| Latitude | `lat` | `centers` | Marker Y position |
| Longitude | `lng` | `centers` | Marker X position |
| Center Name | `center_name` | `centers` | Tooltip label |
| Account Name | `account_global_legal_name` | `centers` | Tooltip context |
| City | `center_city` | `centers` | Tooltip location |

### 6.2 State Choropleth Map

**Source file:** `components/maps/centers-choropleth-map.tsx`

Renders a state-level heatmap overlay showing center density per administrative region.

| Metric | Database Columns | Aggregation | Description |
|--------|-----------------|-------------|-------------|
| Center Count | `center_state`, `center_country_iso2` | `COUNT(*)` grouped by state | Number of centers in each state |
| Distinct Accounts | `account_global_legal_name` | `COUNT(DISTINCT)` per state | Number of unique accounts per state |
| Headcount | `center_employees` | `SUM` per state | Total employees per state |

**Tile matching:** Centers are matched to map tile features using `center_country_iso2` (ISO2 country code) + `center_state` (state name). Disputed boundary aliases are applied based on `NEXT_PUBLIC_MAP_VIEWPOINT_ISO2` (see `documentation/map-disputed-boundaries.md`).

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

**Source file:** `components/export/export-dialog.tsx`, `lib/utils/export-helpers.ts`

The Excel export generates a `.xlsx` file with multiple sheets. Each sheet corresponds to a filtered entity type.

**Sheets and their column sources:**

#### Accounts Sheet

Exports columns from the `accounts` table based on the currently filtered dataset. Key exported fields include:

| Export Column | Database Column |
|---------------|----------------|
| Account Name | `account_global_legal_name` |
| Industry | `account_hq_industry` |
| Sub Industry | `account_hq_sub_industry` |
| Category | `account_primary_category` |
| Segment | `account_primary_nature` |
| Region | `account_hq_region` |
| Country | `account_hq_country` |
| City | `account_hq_city` |
| Revenue | `account_hq_revenue` |
| Revenue Range | `account_hq_revenue_range` |
| Employee Count | `account_hq_employee_count` |
| Employee Range | `account_hq_employee_range` |
| Center Employees | `account_center_employees` |
| Center Employees Range | `account_center_employees_range` |
| Website | `account_hq_website` |
| NASSCOM Status | `account_nasscom_status` |
| Years in India | `years_in_india` |

#### Centers Sheet

Exports columns from the `centers` table:

| Export Column | Database Column |
|---------------|----------------|
| Center Name | `center_name` |
| Account Name | `account_global_legal_name` |
| Status | `center_status` |
| Type | `center_type` |
| Focus | `center_focus` |
| City | `center_city` |
| State | `center_state` |
| Country | `center_country` |
| Employees Range | `center_employees_range` |
| Inc Year | `center_inc_year` |

#### Prospects Sheet

Exports columns from the `prospects` table:

| Export Column | Database Column |
|---------------|----------------|
| Name | `prospect_full_name` |
| Title | `prospect_title` |
| Department | `prospect_department` |
| Level | `prospect_level` |
| Email | `prospect_email` |
| LinkedIn | `prospect_linkedin_url` |
| City | `prospect_city` |
| Country | `prospect_country` |
| Account | `account_global_legal_name` |

> **Access:** Export is restricted to users with the `admin` role (checked via `canExportData()` in `lib/auth/roles.ts`).

---

## Column Quick Reference

A flat listing of every database column referenced in the UI, sorted by table.

### `accounts` table

| Column | Used In |
|--------|---------|
| `account_about` | Account dialog (Company Overview) |
| `account_center_employees` | Account dialog (Business Metrics), Summary cards (Headcount) |
| `account_center_employees_range` | Filter, Accounts table, Account dialog, Charts, Export |
| `account_data_coverage` | Filter |
| `account_first_center_year` | Account dialog (India Operations) |
| `account_global_legal_name` | Filter, Accounts table, Account/Center/Prospect dialogs, Export, Charts |
| `account_hq_city` | Accounts table (hidden), Account dialog, Export |
| `account_hq_company_type` | Account dialog (Company Overview) |
| `account_hq_country` | Filter, Accounts table (hidden), Account dialog, Charts, Export |
| `account_hq_employee_count` | Account dialog (Business Metrics), Export |
| `account_hq_employee_range` | Filter, Account dialog, Charts, Export |
| `account_hq_forbes_2000_rank` | Account dialog (Rankings) |
| `account_hq_fortune_500_rank` | Account dialog (Rankings) |
| `account_hq_industry` | Filter, Accounts table, Account dialog, Charts, Export |
| `account_hq_key_offerings` | Account dialog (Company Overview) |
| `account_hq_linkedin_link` | Account dialog (Links) |
| `account_hq_region` | Filter, Account dialog, Charts |
| `account_hq_revenue` | Filter (range), Account dialog (Business Metrics), Export |
| `account_hq_revenue_range` | Accounts table, Account dialog, Charts, Export |
| `account_hq_stock_ticker` | Account dialog (Company Overview, Financials) |
| `account_hq_sub_industry` | Account dialog, Export |
| `account_hq_website` | Accounts table (logo), Account dialog (Links), Export |
| `account_nasscom_status` | Filter, Accounts table (badge), Account dialog, Charts |
| `account_primary_category` | Filter, Account dialog, Charts, Export |
| `account_primary_nature` | Filter, Account dialog, Charts, Export |
| `account_source` | Filter |
| `account_type` | Filter |
| `uuid` | Recently-updated tracking |
| `years_in_india` | Filter (range), Account dialog, Export |

### `centers` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Centers table (hidden), Center dialog |
| `announced_month` | Center dialog |
| `announced_year` | Center dialog |
| `center_account_website` | Centers table (logo) |
| `center_address` | Center dialog (Location) |
| `center_boardline` | Center dialog |
| `center_business_segment` | Center dialog (Business Info) |
| `center_business_sub_segment` | Center dialog (Business Info) |
| `center_city` | Filter, Centers table, Center dialog, Charts, Cluster map |
| `center_country` | Filter, Centers table, Center dialog, Charts |
| `center_country_iso2` | Choropleth map (tile matching) |
| `center_employees` | Summary cards (Headcount), Choropleth map |
| `center_employees_range` | Filter, Centers table, Center dialog, Charts, Export |
| `center_end_year` | Center dialog |
| `center_focus` | Filter, Center dialog, Charts |
| `center_inc_year` | Filter (range), Center dialog, Export |
| `center_jv_name` | Center dialog (Business Info) |
| `center_jv_status` | Center dialog (Business Info) |
| `center_linkedin` | Center dialog (Links) |
| `center_management_partner` | Center dialog (Business Info) |
| `center_name` | Centers table, Center dialog, Cluster map, Export |
| `center_region` | Center dialog (Location) |
| `center_state` | Filter, Center dialog, Charts, Choropleth map |
| `center_status` | Filter, Center dialog, Charts, Export |
| `center_type` | Filter, Centers table, Center dialog, Charts, Export |
| `center_website` | Center dialog (Links) |
| `center_zip_code` | Center dialog (Location) |
| `cn_unique_key` | Centers table (hidden), Center dialog, Services/Functions join key |
| `lat` | Cluster map, Choropleth map |
| `lng` | Cluster map, Choropleth map |
| `uuid` | Recently-updated tracking |

### `services` table

| Column | Used In |
|--------|---------|
| `center_name` | Services table |
| `cn_unique_key` | Services table |
| `focus_region` | Services table, Center dialog |
| `primary_service` | Services table, Center dialog |
| `service_customer_support` | Services table, Center dialog |
| `service_erd` | Services table, Center dialog |
| `service_fna` | Services table, Center dialog |
| `service_hr` | Services table, Center dialog |
| `service_it` | Services table, Center dialog |
| `service_others` | Services table, Center dialog |
| `service_procurement` | Services table, Center dialog |
| `service_sales_marketing` | Services table, Center dialog |
| `software_in_use` | Services table |
| `software_vendor` | Services table |

### `functions` table

| Column | Used In |
|--------|---------|
| `cn_unique_key` | Functions table, Filter join |
| `function_name` | Filter, Functions table, Charts |

### `tech` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Tech treemap (scoping) |
| `cn_unique_key` | Filter join |
| `software_category` | Tech treemap (Level 1 grouping) |
| `software_in_use` | Filter (keyword), Tech treemap (Level 2) |

### `prospects` table

| Column | Used In |
|--------|---------|
| `account_global_legal_name` | Prospects table (hidden), Prospect dialog |
| `center_name` | Prospect dialog, Account dialog (Prospects tab) |
| `prospect_city` | Filter, Prospects table, Prospect dialog, Export |
| `prospect_country` | Prospects table, Prospect dialog, Export |
| `prospect_department` | Filter, Prospects table, Prospect dialog, Export |
| `prospect_email` | Prospect dialog, Export |
| `prospect_first_name` | Prospects table (avatar), Prospect dialog |
| `prospect_full_name` | Prospects table, Export |
| `prospect_last_name` | Prospects table (avatar), Prospect dialog |
| `prospect_level` | Filter, Prospect dialog, Account dialog (Prospects tab), Export |
| `prospect_linkedin_url` | Prospect dialog, Export |
| `prospect_state` | Prospect dialog |
| `prospect_title` | Filter (keyword), Prospects table, Prospect dialog, Export |
| `uuid` | Recently-updated tracking |

### Audit tables

| Column | Table | Used In |
|--------|-------|---------|
| Various change fields | `audit.field_change_events` | Notifications |
| Read status | `audit.notification_reads` | Notification bell unread count |
| Import metadata | `audit.import_runs` | Data import tracking |
