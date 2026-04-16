"use server"

import type { Account, Center, Function, Service, Tech, Prospect } from "@/lib/types"
import { getSqlOrThrow, fetchWithRetry } from "@/lib/db/connection"

// ============================================
// BASIC DATA FETCHING FUNCTIONS
// ============================================

export async function getAccounts(): Promise<Account[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT * FROM accounts ORDER BY account_global_legal_name`
    )) as Account[]
  } catch (error) {
    console.error("Error fetching accounts:", error)
    return []
  }
}

export async function getCenters(): Promise<Center[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(() => sqlClient`SELECT * FROM centers ORDER BY center_name`)) as Center[]
  } catch (error) {
    console.error("Error fetching centers:", error)
    return []
  }
}

export async function getFunctions(): Promise<Function[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(() => sqlClient`SELECT * FROM functions ORDER BY cn_unique_key`)) as Function[]
  } catch (error) {
    console.error("Error fetching functions:", error)
    return []
  }
}

export async function getServices(): Promise<Service[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(() => sqlClient`SELECT * FROM services ORDER BY center_name`)) as Service[]
  } catch (error) {
    console.error("Error fetching services:", error)
    return []
  }
}

export async function getTech(): Promise<Tech[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT * FROM tech ORDER BY account_global_legal_name, software_category, software_in_use`
    )) as Tech[]
  } catch (error) {
    console.error("Error fetching tech:", error)
    return []
  }
}

export async function getProspects(): Promise<Prospect[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT * FROM prospects ORDER BY prospect_last_name, prospect_first_name`
    )) as Prospect[]
  } catch (error) {
    console.error("Error fetching prospects:", error)
    return []
  }
}

// ============================================
// DASHBOARD-OPTIMIZED QUERIES (specific columns only)
// ============================================

async function getDashboardAccounts(): Promise<Account[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT account_nasscom_status, account_nasscom_member_status, account_data_coverage,
        account_source, account_type, account_global_legal_name, account_hq_stock_ticker,
        account_hq_company_type, account_about, account_hq_key_offerings,
        account_hq_city, account_hq_country, account_hq_region,
        account_hq_sub_industry, account_hq_industry, account_hq_linkedin_link,
        account_primary_category, account_primary_nature, account_hq_revenue,
        account_hq_revenue_range, account_hq_employee_count, account_hq_employee_range,
        account_hq_forbes_2000_rank, account_hq_fortune_500_rank,
        account_first_center_year, years_in_india, account_hq_website,
        account_center_employees, account_center_employees_range
        FROM accounts ORDER BY account_global_legal_name`
    )) as Account[]
  } catch (error) {
    console.error("Error fetching dashboard accounts:", error)
    return []
  }
}

async function getDashboardCenters(): Promise<Center[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT account_global_legal_name, cn_unique_key, center_status, center_inc_year,
        announced_year, announced_month, center_end_year, center_name,
        center_management_partner, center_jv_status, center_jv_name,
        center_type, center_focus, center_website, center_linkedin,
        center_city, center_state, center_country, center_country_iso2,
        center_region, center_employees, center_employees_range,
        center_business_segment, center_business_sub_segment,
        center_boardline, center_account_website, lat, lng
        FROM centers ORDER BY center_name`
    )) as Center[]
  } catch (error) {
    console.error("Error fetching dashboard centers:", error)
    return []
  }
}

async function getDashboardFunctions(): Promise<Function[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT cn_unique_key, function_name FROM functions ORDER BY cn_unique_key`
    )) as Function[]
  } catch (error) {
    console.error("Error fetching dashboard functions:", error)
    return []
  }
}

async function getDashboardServices(): Promise<Service[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT cn_unique_key, center_name, primary_service, focus_region,
        service_it, service_erd, service_fna, service_hr,
        service_procurement, service_sales_marketing, service_customer_support,
        service_others, software_vendor, software_in_use
        FROM services ORDER BY center_name`
    )) as Service[]
  } catch (error) {
    console.error("Error fetching dashboard services:", error)
    return []
  }
}

async function getDashboardTech(): Promise<Tech[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT account_global_legal_name, cn_unique_key, software_in_use,
        software_vendor, software_category
        FROM tech ORDER BY account_global_legal_name, software_category, software_in_use`
    )) as Tech[]
  } catch (error) {
    console.error("Error fetching dashboard tech:", error)
    return []
  }
}

async function getDashboardProspects(): Promise<Prospect[]> {
  try {
    const sqlClient = getSqlOrThrow()
    return (await fetchWithRetry(
      () => sqlClient`SELECT account_global_legal_name, prospect_full_name, prospect_first_name,
        prospect_last_name, prospect_title, head_type, prospect_department, prospect_level,
        prospect_email, prospect_linkedin_url, prospect_city, prospect_state,
        prospect_country
        FROM prospects ORDER BY prospect_last_name, prospect_first_name`
    )) as Prospect[]
  } catch (error) {
    console.error("Error fetching dashboard prospects:", error)
    return []
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
  error: string | null
}

export async function getAllData(): Promise<AllDataResult> {
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is not set")
      return {
        accounts: [],
        centers: [],
        functions: [],
        services: [],
        tech: [],
        prospects: [],
        error: "Database configuration missing",
      }
    }

    // Ensure we can get the SQL client
    try {
        getSqlOrThrow()
    } catch {
        console.error("Database connection not initialized")
        return {
          accounts: [],
          centers: [],
          functions: [],
          services: [],
          tech: [],
          prospects: [],
          error: "Database connection failed",
        }
    }

    // Fetch all data in parallel with retry logic
    const [accounts, centers, functions, services, tech, prospects] = await Promise.all([
      getAccounts(),
      getCenters(),
      getFunctions(),
      getServices(),
      getTech(),
      getProspects(),
    ])

    return {
      accounts,
      centers,
      functions,
      services,
      tech,
      prospects,
      error: null,
    } satisfies AllDataResult
  } catch (error) {
    console.error("Error fetching all data:", error)
    return {
      accounts: [],
      centers: [],
      functions: [],
      services: [],
      tech: [],
      prospects: [],
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

/**
 * Dashboard-optimized data fetch (specific columns, smaller payload).
 * Used by the /api/dashboard route. Exports use getAllData() for full columns.
 */
export async function getDashboardData(): Promise<AllDataResult> {
  try {
    if (!process.env.DATABASE_URL) {
      return { accounts: [], centers: [], functions: [], services: [], tech: [], prospects: [], error: "Database configuration missing" }
    }

    try {
      getSqlOrThrow()
    } catch {
      return { accounts: [], centers: [], functions: [], services: [], tech: [], prospects: [], error: "Database connection failed" }
    }

    const [accounts, centers, functions, services, tech, prospects] = await Promise.all([
      getDashboardAccounts(),
      getDashboardCenters(),
      getDashboardFunctions(),
      getDashboardServices(),
      getDashboardTech(),
      getDashboardProspects(),
    ])

    return { accounts, centers, functions, services, tech, prospects, error: null } satisfies AllDataResult
  } catch (error) {
    console.error("Error fetching dashboard data:", error)
    return {
      accounts: [], centers: [], functions: [], services: [], tech: [], prospects: [],
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

// ============================================
// SERVER-SIDE FILTERING (ADVANCED - OPTIONAL)
// ============================================

/**
 * Get filtered accounts from server side
 * This is more efficient for large datasets
 */
export async function getFilteredAccounts(filters: {
  countries?: string[]
  industries?: string[]
}): Promise<{ success: boolean; data: Account[]; error?: string }> {
  try {
    const sqlClient = getSqlOrThrow()

    let query = sqlClient`SELECT * FROM accounts WHERE 1=1`

    if (filters.countries && filters.countries.length > 0) {
      query = sqlClient`${query} AND account_hq_country = ANY(${filters.countries})`
    }

    if (filters.industries && filters.industries.length > 0) {
      query = sqlClient`${query} AND account_hq_industry = ANY(${filters.industries})`
    }

    query = sqlClient`${query} ORDER BY account_global_legal_name`

    const results = (await fetchWithRetry(() => query)) as Account[]
    return { success: true, data: results }
  } catch (error) {
    console.error("Error fetching filtered accounts:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error", data: [] }
  }
}

// ============================================
// LEGACY COMPATIBILITY FUNCTIONS
// ============================================

export async function loadData(_filters: unknown): Promise<{ success: boolean; data?: AllDataResult; error?: string }> {
  try {
    const data = await getAllData()
    return { success: true, data }
  } catch (error) {
    console.error("Error in loadData:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function exportToExcel(data: unknown[]): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    // This function handles the Excel export
    // The actual Excel generation happens on the client side with the exceljs library
    return { success: true, downloadUrl: "#" }
  } catch (error) {
    console.error("Error in exportToExcel:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
