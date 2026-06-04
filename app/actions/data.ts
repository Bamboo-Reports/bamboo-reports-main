import type { Account, Alias, Center, Function, Service, Tech, Prospect, LockedProspectTeaser } from "@/lib/types"
import { getProspectsPerAccountLimit, isSectionEnabled } from "@/lib/config/dashboard-access"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import { getPrismaOrThrow, queryWithRetry } from "@/lib/db/prisma"
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

function normalizeAccount(row: Account & { account_hq_revenue?: bigint | number | null }): Account {
  return {
    ...row,
    account_hq_revenue:
      typeof row.account_hq_revenue === "bigint"
        ? Number(row.account_hq_revenue)
        : row.account_hq_revenue ?? null,
  }
}

async function measureRows<T>(label: string, query: () => Promise<T[]>): Promise<T[]> {
  const startedAt = Date.now()
  try {
    const rows = await queryWithRetry(query)
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
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "aliases",
      () => prisma.$queryRaw`SELECT uuid, account_global_legal_name, short_legal_name, brand_name,
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
    const prisma = getPrismaOrThrow()
    const rows = await measureRows(
      "dashboard_accounts",
      () => prisma.accountWarehouse.findMany({
        select: {
          account_nasscom_status: true,
          account_nasscom_member_status: true,
          account_data_coverage: true,
          account_source: true,
          account_type: true,
          account_global_legal_name: true,
          account_hq_stock_ticker: true,
          account_hq_company_type: true,
          account_about: true,
          account_hq_key_offerings: true,
          account_hq_city: true,
          account_hq_state: true,
          account_hq_country: true,
          account_hq_region: true,
          account_hq_sub_industry: true,
          account_hq_industry: true,
          account_hq_linkedin_link: true,
          account_primary_category: true,
          account_primary_nature: true,
          account_hq_revenue: true,
          account_hq_revenue_range: true,
          account_hq_employee_count: true,
          account_hq_employee_range: true,
          account_hq_forbes_2000_rank: true,
          account_hq_fortune_500_rank: true,
          account_first_center_year: true,
          years_in_india: true,
          account_hq_website: true,
          account_center_employees: true,
          account_center_employees_range: true,
          account_visibility: true,
          account_visibility_note: true,
        },
        orderBy: { account_global_legal_name: "asc" },
      })
    )
    return rows.map((row) => normalizeAccount(row as Account & { account_hq_revenue?: bigint | null }))
  } catch (error) {
    logger.error("fetch_dashboard_accounts_failed", { error })
    return []
  }
}

async function getDashboardCenters(): Promise<Center[]> {
  try {
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "dashboard_centers",
      () => prisma.centerWarehouse.findMany({
        select: {
          account_global_legal_name: true,
          cn_unique_key: true,
          center_status: true,
          center_inc_year: true,
          announced_year: true,
          announced_month: true,
          center_end_year: true,
          center_name: true,
          center_management_partner: true,
          center_jv_status: true,
          center_jv_name: true,
          center_type: true,
          center_focus: true,
          center_website: true,
          center_linkedin: true,
          center_city: true,
          center_state: true,
          center_country: true,
          center_country_iso2: true,
          center_region: true,
          center_employees: true,
          center_employees_range: true,
          center_business_segment: true,
          center_business_sub_segment: true,
          center_boardline: true,
          center_account_website: true,
          center_timeline: true,
          center_address: true,
          center_zip_code: true,
          lat: true,
          lng: true,
        },
        orderBy: { center_name: "asc" },
      })
    )) as Center[]
  } catch (error) {
    logger.error("fetch_dashboard_centers_failed", { error })
    return []
  }
}

async function getDashboardFunctions(): Promise<Function[]> {
  try {
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "dashboard_functions",
      () => prisma.$queryRaw`SELECT cn_unique_key, function_name FROM functions ORDER BY cn_unique_key`
    )) as Function[]
  } catch (error) {
    logger.error("fetch_dashboard_functions_failed", { error })
    return []
  }
}

async function getDashboardServices(): Promise<Service[]> {
  try {
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "dashboard_services",
      () => prisma.$queryRaw`SELECT cn_unique_key, center_name, primary_service, focus_region,
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
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "dashboard_tech",
      () => prisma.$queryRaw`SELECT account_global_legal_name, cn_unique_key, software_in_use,
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
    const prisma = getPrismaOrThrow()
    return (await measureRows(
      "dashboard_prospects",
      () => prisma.$queryRaw`SELECT ps_unique_key, account_global_legal_name,
        prospect_full_name, prospect_first_name, prospect_last_name,
        prospect_title, prospect_department, prospect_level, head_type, prospect_linkedin_url,
        prospect_email, prospect_city, prospect_state,
        prospect_country, prospect_in_company_year, prospect_current_year, center_name
        FROM prospects`
    )) as Prospect[]
  } catch (error) {
    logger.error("fetch_dashboard_prospects_failed", { error })
    return []
  }
}

async function getDashboardSummaryMetrics(): Promise<DashboardSummaryMetrics> {
  try {
    const prisma = getPrismaOrThrow()

    const [accountsCountRows, centersSummaryRows, prospectsCountRows] = await Promise.all([
      measureRows("dashboard_summary_accounts", () => prisma.$queryRaw<Array<{ total_full: number; total_visible: number }>>`
        SELECT
          COUNT(*)::int AS total_full,
          COUNT(*) FILTER (WHERE account_visibility IS DISTINCT FROM 'exclude')::int AS total_visible
        FROM accounts
      `),
      measureRows("dashboard_summary_centers", () => prisma.$queryRaw<Array<{
        total_centers_full: number
        total_centers_visible: number
        total_upcoming_full: number
        total_upcoming_visible: number
        total_headcount_full: number
        total_headcount_visible: number
      }>>`
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
      measureRows("dashboard_summary_prospects", () => prisma.$queryRaw<Array<{ total_full: number; total_visible: number }>>`
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
      getPrismaOrThrow()
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
