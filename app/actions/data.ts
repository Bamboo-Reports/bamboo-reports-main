import type { Account, Alias, Center, Function, Service, Tech, Prospect, LockedProspectTeaser } from "@/lib/types"
import { getProspectsPerAccountLimit, isSectionEnabled } from "@/lib/config/dashboard-access"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import { getSqlOrThrow, fetchWithRetry } from "@/lib/db/connection"
import { createLogger } from "@/lib/logger"

export type DashboardSummaryMetrics = {
  totalAccountsCount: number
  totalAccountsCountFull: number
  totalCentersCount: number
  totalCentersCountFull: number
  totalUpcomingCentersCount: number
  totalUpcomingCentersCountFull: number
  totalProspectsCount: number
  totalProspectsCountFull: number
  totalHeadcount: number
  totalHeadcountFull: number
}

const EMPTY_SUMMARY_METRICS: DashboardSummaryMetrics = {
  totalAccountsCount: 0,
  totalAccountsCountFull: 0,
  totalCentersCount: 0,
  totalCentersCountFull: 0,
  totalUpcomingCentersCount: 0,
  totalUpcomingCentersCountFull: 0,
  totalProspectsCount: 0,
  totalProspectsCountFull: 0,
  totalHeadcount: 0,
  totalHeadcountFull: 0,
}

const logger = createLogger("actions/data")

async function measureRows<T>(label: string, query: () => Promise<T[]>): Promise<T[]> {
  const startedAt = Date.now()
  try {
    const rows = await fetchWithRetry(query)
    logger.debug("query_succeeded", {
      label,
      row_count: rows.length,
      duration_ms: Date.now() - startedAt,
    })
    return rows
  } catch (error) {
    logger.error("query_failed", {
      label,
      duration_ms: Date.now() - startedAt,
      error,
    })
    throw error
  }
}

async function getAliases(): Promise<Alias[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "aliases",
      () => sqlClient`SELECT account_global_legal_name, short_legal_name, brand_name,
        abbreviated_name, flagship_products, currently_known_as, notes
        FROM alias`
    )) as Alias[]
  } catch (error) {
    logger.error("fetch_aliases_failed", { error })
    return []
  }
}

// ============================================
// DASHBOARD-OPTIMIZED QUERIES (specific columns only)
// ============================================

async function getDashboardAccounts(): Promise<Account[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_accounts",
      () => sqlClient`SELECT account_nasscom_status, account_nasscom_member_status, account_data_coverage,
        account_source, account_type, account_global_legal_name, account_hq_stock_ticker,
        account_hq_company_type, account_about, account_hq_key_offerings,
        account_hq_city, account_hq_state, account_hq_country, account_hq_region,
        account_hq_sub_industry, account_hq_industry, account_hq_linkedin_link,
        account_primary_category, account_primary_nature, account_hq_revenue,
        account_hq_revenue_range, account_hq_employee_count, account_hq_employee_range,
        account_hq_forbes_2000_rank, account_hq_fortune_500_rank,
        account_first_center_year, years_in_india, account_hq_website,
        account_center_employees, account_center_employees_range,
        account_visibility, account_visibility_note
        FROM accounts ORDER BY account_global_legal_name`
    )) as Account[]
  } catch (error) {
    logger.error("fetch_dashboard_accounts_failed", { error })
    return []
  }
}

async function getDashboardCenters(): Promise<Center[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_centers",
      () => sqlClient`SELECT account_global_legal_name, cn_unique_key, center_status, center_inc_year,
        announced_year, announced_month, center_end_year, center_name,
        center_management_partner, center_jv_status, center_jv_name,
        center_type, center_focus, center_website, center_linkedin,
        center_city, center_state, center_country, center_country_iso2,
        center_region, center_employees, center_employees_range,
        center_business_segment, center_business_sub_segment,
        center_boardline, center_account_website, center_timeline, center_address, center_zip_code, lat, lng
        FROM centers ORDER BY center_name`
    )) as Center[]
  } catch (error) {
    logger.error("fetch_dashboard_centers_failed", { error })
    return []
  }
}

async function getDashboardFunctions(): Promise<Function[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_functions",
      () => sqlClient`SELECT cn_unique_key, function_name FROM functions ORDER BY cn_unique_key`
    )) as Function[]
  } catch (error) {
    logger.error("fetch_dashboard_functions_failed", { error })
    return []
  }
}

async function getDashboardServices(): Promise<Service[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_services",
      () => sqlClient`SELECT cn_unique_key, center_name, primary_service, focus_region,
        service_it, service_erd, service_fna, service_hr,
        service_procurement, service_sales_marketing, service_customer_support,
        service_others, software_vendor, software_in_use
        FROM services ORDER BY center_name`
    )) as Service[]
  } catch (error) {
    logger.error("fetch_dashboard_services_failed", { error })
    return []
  }
}

async function getDashboardTech(): Promise<Tech[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_tech",
      () => sqlClient`SELECT account_global_legal_name, cn_unique_key, software_in_use,
        software_vendor, software_category
        FROM tech ORDER BY account_global_legal_name, software_category, software_in_use`
    )) as Tech[]
  } catch (error) {
    logger.error("fetch_dashboard_tech_failed", { error })
    return []
  }
}

async function getDashboardProspects(): Promise<Prospect[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await measureRows(
      "dashboard_prospects",
      () => sqlClient`SELECT ps_unique_key, account_global_legal_name,
        prospect_full_name, prospect_first_name, prospect_last_name,
        prospect_title, prospect_department, prospect_level, head_type, prospect_linkedin_url,
        prospect_email, prospect_city, prospect_state,
        prospect_country
        FROM prospects`
    )) as Prospect[]
  } catch (error) {
    logger.error("fetch_dashboard_prospects_failed", { error })
    return []
  }
}

async function getDashboardSummaryMetrics(): Promise<DashboardSummaryMetrics> {
  try {
    const sqlClient = getSqlOrThrow()

    const [accountsCountRows, centersSummaryRows, prospectsCountRows] = await Promise.all([
      measureRows("dashboard_summary_accounts", () => sqlClient`
        SELECT
          COUNT(*)::int AS total_full,
          COUNT(*) FILTER (WHERE account_visibility IS DISTINCT FROM 'exclude')::int AS total_visible
        FROM accounts
      `),
      measureRows("dashboard_summary_centers", () => sqlClient`
        SELECT
          COUNT(*)::int AS total_centers_full,
          COUNT(*) FILTER (WHERE a.account_visibility IS DISTINCT FROM 'exclude')::int AS total_centers_visible,
          COUNT(*) FILTER (WHERE c.center_status = 'Upcoming')::int AS total_upcoming_full,
          COUNT(*) FILTER (WHERE c.center_status = 'Upcoming' AND a.account_visibility IS DISTINCT FROM 'exclude')::int AS total_upcoming_visible,
          COALESCE(SUM(c.center_employees), 0)::int AS total_headcount_full,
          COALESCE(SUM(c.center_employees) FILTER (WHERE a.account_visibility IS DISTINCT FROM 'exclude'), 0)::int AS total_headcount_visible
        FROM centers c
        LEFT JOIN accounts a ON a.account_global_legal_name = c.account_global_legal_name
      `),
      measureRows("dashboard_summary_prospects", () => sqlClient`
        SELECT
          COUNT(*)::int AS total_full,
          COUNT(*) FILTER (WHERE a.account_visibility IS DISTINCT FROM 'exclude')::int AS total_visible
        FROM prospects p
        LEFT JOIN accounts a ON a.account_global_legal_name = p.account_global_legal_name
      `),
    ])

    const accountsRow = (accountsCountRows as Array<{ total_full: number; total_visible: number }>)[0]
    const centersSummary = (centersSummaryRows as Array<{
      total_centers_full: number
      total_centers_visible: number
      total_upcoming_full: number
      total_upcoming_visible: number
      total_headcount_full: number
      total_headcount_visible: number
    }>)[0]
    const prospectsRow = (prospectsCountRows as Array<{ total_full: number; total_visible: number }>)[0]

    return {
      totalAccountsCount: Number(accountsRow?.total_visible ?? 0),
      totalAccountsCountFull: Number(accountsRow?.total_full ?? 0),
      totalCentersCount: Number(centersSummary?.total_centers_visible ?? 0),
      totalCentersCountFull: Number(centersSummary?.total_centers_full ?? 0),
      totalUpcomingCentersCount: Number(centersSummary?.total_upcoming_visible ?? 0),
      totalUpcomingCentersCountFull: Number(centersSummary?.total_upcoming_full ?? 0),
      totalProspectsCount: Number(prospectsRow?.total_visible ?? 0),
      totalProspectsCountFull: Number(prospectsRow?.total_full ?? 0),
      totalHeadcount: Number(centersSummary?.total_headcount_visible ?? 0),
      totalHeadcountFull: Number(centersSummary?.total_headcount_full ?? 0),
    }
  } catch (error) {
    logger.error("fetch_dashboard_summary_metrics_failed", { error })
    return { ...EMPTY_SUMMARY_METRICS }
  }
}

// ============================================
// AGGREGATED DATA FUNCTIONS
// ============================================

export type AllDataResult = {
  accounts: Account[]
  centers: Center[]
  functions: Function[]
  services: Service[]
  tech: Tech[]
  prospects: Prospect[]
  aliases: Alias[]
  lockedProspectTeasers: LockedProspectTeaser[]
  summary: DashboardSummaryMetrics
  error: string | null
}

/**
 * Dashboard-optimized data fetch (specific columns, smaller payload).
 * Used by the /api/dashboard route. Full-schema exports live in
 * lib/exports/server-builder.ts and are gated by the export API.
 */
export async function getDashboardData(): Promise<AllDataResult> {
  const startedAt = Date.now()
  try {
    if (!process.env.DATABASE_URL) {
      logger.error("dashboard_database_url_missing")
      return {
        accounts: [],
        centers: [],
        functions: [],
        services: [],
        tech: [],
        prospects: [],
        aliases: [],
        lockedProspectTeasers: [],
        summary: { ...EMPTY_SUMMARY_METRICS },
        error: "Database configuration missing",
      }
    }

    try {
      getSqlOrThrow()
    } catch {
      logger.error("dashboard_database_connection_unavailable")
      return {
        accounts: [],
        centers: [],
        functions: [],
        services: [],
        tech: [],
        prospects: [],
        aliases: [],
        lockedProspectTeasers: [],
        summary: { ...EMPTY_SUMMARY_METRICS },
        error: "Database connection failed",
      }
    }

    const accountsEnabled = isSectionEnabled("accounts")
    const centersEnabled = isSectionEnabled("centers")
    const prospectsEnabled = isSectionEnabled("prospects")
    const prospectsPerAccountLimit = getProspectsPerAccountLimit()

    const [accounts, centers, functions, services, tech, rawProspects, aliases, summary] = await Promise.all([
      accountsEnabled ? getDashboardAccounts() : Promise.resolve([]),
      centersEnabled ? getDashboardCenters() : Promise.resolve([]),
      centersEnabled ? getDashboardFunctions() : Promise.resolve([]),
      centersEnabled ? getDashboardServices() : Promise.resolve([]),
      accountsEnabled || centersEnabled ? getDashboardTech() : Promise.resolve([]),
      prospectsEnabled ? getDashboardProspects() : Promise.resolve([]),
      accountsEnabled ? getAliases() : Promise.resolve([]),
      getDashboardSummaryMetrics(),
    ])

    const { visibleProspects, lockedProspectTeasers } = partitionProspectsByAccess(rawProspects, prospectsPerAccountLimit)

    logger.info("dashboard_data_loaded", {
      duration_ms: Date.now() - startedAt,
      accounts_enabled: accountsEnabled,
      centers_enabled: centersEnabled,
      prospects_enabled: prospectsEnabled,
      prospects_per_account_limit: prospectsPerAccountLimit,
      accounts_count: accounts.length,
      centers_count: centers.length,
      functions_count: functions.length,
      services_count: services.length,
      tech_count: tech.length,
      raw_prospects_count: rawProspects.length,
      visible_prospects_count: visibleProspects.length,
      locked_prospect_teasers_count: lockedProspectTeasers.length,
      aliases_count: aliases.length,
    })

    return {
      accounts,
      centers,
      functions,
      services,
      tech,
      prospects: visibleProspects,
      aliases,
      lockedProspectTeasers,
      summary,
      error: null,
    } satisfies AllDataResult
  } catch (error) {
    logger.error("dashboard_data_load_failed", {
      duration_ms: Date.now() - startedAt,
      error,
    })
    return {
      accounts: [], centers: [], functions: [], services: [], tech: [], prospects: [], aliases: [], lockedProspectTeasers: [],
      summary: { ...EMPTY_SUMMARY_METRICS },
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}
