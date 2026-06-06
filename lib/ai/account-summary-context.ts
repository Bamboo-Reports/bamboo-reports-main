import "server-only"

import { getProspectsPerAccountLimit, isSectionEnabled } from "@/lib/config/dashboard-access"
import { getPrismaOrThrow, queryWithRetry } from "@/lib/db/prisma"
import { partitionProspectsByAccess } from "@/lib/dashboard/prospect-access"
import type { Account, Center, Function, Prospect, Service, Tech } from "@/lib/types"

type CountItem = {
  name: string
  count: number
}

export type AccountSummaryContext = {
  account: {
    name: string
    about: string | null
    keyOfferings: string[]
    headquarters: {
      city: string | null
      state: string | null
      country: string | null
      region: string | null
    }
    industry: string | null
    subIndustry: string | null
    category: string | null
    nature: string | null
    companyType: string | null
    nasscomStatus: string | null
    revenue: number | null
    revenueRange: string | null
    globalEmployees: number | null
    globalEmployeeRange: string | null
    forbes2000Rank: number | null
    fortune500Rank: number | null
  }
  indiaPresence: {
    firstCenterYear: number | null
    yearsInIndia: number | null
    accountCenterEmployees: number | null
    accountCenterEmployeeRange: string | null
  }
  centers: {
    total: number
    knownHeadcount: number
    byCity: CountItem[]
    byState: CountItem[]
    byType: CountItem[]
    byStatus: CountItem[]
    byFocus: CountItem[]
  } | null
  services: {
    primaryServices: CountItem[]
    functions: CountItem[]
  } | null
  technology: {
    totalRecords: number
    categories: CountItem[]
    vendors: CountItem[]
    software: CountItem[]
  }
  prospects: {
    visibleCount: number
    restrictedCount: number
    byDepartment: CountItem[]
    byLevel: CountItem[]
    byHeadType: CountItem[]
    byCity: CountItem[]
  } | null
}

function cleanString(value: string | null | undefined, maxLength = 500): string | null {
  const cleaned = value?.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function countValues(values: Array<string | null | undefined>, limit = 8): CountItem[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    const cleaned = cleanString(value, 120)
    if (!cleaned) continue
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1)
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function splitLines(value: string | null | undefined, limit = 12): string[] {
  return (value ?? "")
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

export async function buildAccountSummaryContext(accountName: string): Promise<AccountSummaryContext | null> {
  const prisma = getPrismaOrThrow()
  const account = await queryWithRetry(() => prisma.accountWarehouse.findUnique({
    where: { account_global_legal_name: accountName },
  }))

  if (!account) return null

  const centersEnabled = isSectionEnabled("centers")
  const prospectsEnabled = isSectionEnabled("prospects")

  const centers = centersEnabled
    ? await queryWithRetry(() => prisma.centerWarehouse.findMany({
        where: { account_global_legal_name: accountName },
        orderBy: { center_name: "asc" },
      })) as Center[]
    : []
  const centerKeys = centers.map((center) => center.cn_unique_key)

  const [services, functions, tech, rawProspects] = await Promise.all([
    centersEnabled && centerKeys.length > 0
      ? queryWithRetry(() => prisma.$queryRaw<Service[]>`
          SELECT cn_unique_key, primary_service
          FROM services
          WHERE cn_unique_key = ANY(${centerKeys})
        `)
      : Promise.resolve([]),
    centersEnabled && centerKeys.length > 0
      ? queryWithRetry(() => prisma.$queryRaw<Function[]>`
          SELECT cn_unique_key, function_name
          FROM functions
          WHERE cn_unique_key = ANY(${centerKeys})
        `)
      : Promise.resolve([]),
    queryWithRetry(() => prisma.$queryRaw<Tech[]>`
      SELECT account_global_legal_name, cn_unique_key, software_in_use, software_vendor, software_category
      FROM tech
      WHERE account_global_legal_name = ${accountName}
    `),
    prospectsEnabled
      ? queryWithRetry(() => prisma.$queryRaw<Prospect[]>`
          SELECT account_global_legal_name, prospect_department, prospect_level, head_type,
            prospect_city, prospect_state, prospect_country
          FROM prospects
          WHERE account_global_legal_name = ${accountName}
        `)
      : Promise.resolve([]),
  ])

  const { visibleProspects, lockedProspectTeasers } = partitionProspectsByAccess(
    rawProspects,
    getProspectsPerAccountLimit()
  )

  return {
    account: {
      name: account.account_global_legal_name,
      about: cleanString(account.account_about, 2000),
      keyOfferings: splitLines(account.account_hq_key_offerings),
      headquarters: {
        city: cleanString(account.account_hq_city),
        state: cleanString(account.account_hq_state),
        country: cleanString(account.account_hq_country),
        region: cleanString(account.account_hq_region),
      },
      industry: cleanString(account.account_hq_industry),
      subIndustry: cleanString(account.account_hq_sub_industry),
      category: cleanString(account.account_primary_category),
      nature: cleanString(account.account_primary_nature),
      companyType: cleanString(account.account_hq_company_type),
      nasscomStatus: cleanString(account.account_nasscom_status),
      revenue: typeof account.account_hq_revenue === "bigint"
        ? Number(account.account_hq_revenue)
        : account.account_hq_revenue ?? null,
      revenueRange: cleanString(account.account_hq_revenue_range),
      globalEmployees: account.account_hq_employee_count,
      globalEmployeeRange: cleanString(account.account_hq_employee_range),
      forbes2000Rank: account.account_hq_forbes_2000_rank,
      fortune500Rank: account.account_hq_fortune_500_rank,
    },
    indiaPresence: {
      firstCenterYear: account.account_first_center_year,
      yearsInIndia: account.years_in_india,
      accountCenterEmployees: account.account_center_employees,
      accountCenterEmployeeRange: cleanString(account.account_center_employees_range),
    },
    centers: centersEnabled ? {
      total: centers.length,
      knownHeadcount: centers.reduce((sum, center) => sum + (center.center_employees ?? 0), 0),
      byCity: countValues(centers.map((center) => center.center_city)),
      byState: countValues(centers.map((center) => center.center_state)),
      byType: countValues(centers.map((center) => center.center_type)),
      byStatus: countValues(centers.map((center) => center.center_status)),
      byFocus: countValues(centers.map((center) => center.center_focus)),
    } : null,
    services: centersEnabled ? {
      primaryServices: countValues(services.map((service) => service.primary_service)),
      functions: countValues(functions.map((item) => item.function_name)),
    } : null,
    technology: {
      totalRecords: tech.length,
      categories: countValues(tech.map((item) => item.software_category)),
      vendors: countValues(tech.map((item) => item.software_vendor)),
      software: countValues(tech.map((item) => item.software_in_use)),
    },
    prospects: prospectsEnabled ? {
      visibleCount: visibleProspects.length,
      restrictedCount: lockedProspectTeasers.length,
      byDepartment: countValues(rawProspects.map((prospect) => prospect.prospect_department)),
      byLevel: countValues(rawProspects.map((prospect) => prospect.prospect_level)),
      byHeadType: countValues(rawProspects.map((prospect) => prospect.head_type)),
      byCity: countValues(rawProspects.map((prospect) => prospect.prospect_city)),
    } : null,
  }
}
