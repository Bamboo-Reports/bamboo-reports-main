import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { buildEntityAggregateQuery, type AggregateEntity, type FilterAccess } from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"
import type { AvailableOptions, FilterOption, FilterValue, Filters } from "@/lib/types"

export const dynamic = "force-dynamic"

const logger = createLogger("api/dashboard/facets")

type FacetSpec = { key: keyof AvailableOptions; entity: AggregateEntity; column: string }

// Mirrors getAvailableOptions in lib/dashboard/filtering.ts.
const FACETS: FacetSpec[] = [
  { key: "accountHqRegionValues", entity: "accounts", column: "account_hq_region" },
  { key: "accountHqCountryValues", entity: "accounts", column: "account_hq_country" },
  { key: "accountHqIndustryValues", entity: "accounts", column: "account_hq_industry" },
  { key: "accountDataCoverageValues", entity: "accounts", column: "account_data_coverage" },
  { key: "accountSourceValues", entity: "accounts", column: "account_source" },
  { key: "accountTypeValues", entity: "accounts", column: "account_type" },
  { key: "accountPrimaryCategoryValues", entity: "accounts", column: "account_primary_category" },
  { key: "accountPrimaryNatureValues", entity: "accounts", column: "account_primary_nature" },
  { key: "accountNasscomStatusValues", entity: "accounts", column: "account_nasscom_status" },
  { key: "accountHqEmployeeRangeValues", entity: "accounts", column: "account_hq_employee_range" },
  { key: "accountCenterEmployeesRangeValues", entity: "accounts", column: "account_center_employees_range" },
  { key: "centerTypeValues", entity: "centers", column: "center_type" },
  { key: "centerFocusValues", entity: "centers", column: "center_focus" },
  { key: "centerCityValues", entity: "centers", column: "center_city" },
  { key: "centerStateValues", entity: "centers", column: "center_state" },
  { key: "centerCountryValues", entity: "centers", column: "center_country" },
  { key: "centerEmployeesRangeValues", entity: "centers", column: "center_employees_range" },
  { key: "centerStatusValues", entity: "centers", column: "center_status" },
  { key: "functionNameValues", entity: "functions", column: "function_name" },
  { key: "prospectDepartmentValues", entity: "prospects", column: "prospect_department" },
  { key: "prospectHeadTypeValues", entity: "prospects", column: "head_type" },
  { key: "prospectLevelValues", entity: "prospects", column: "prospect_level" },
  { key: "prospectCityValues", entity: "prospects", column: "prospect_city" },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

async function facetOptions(filters: Filters, access: FilterAccess, spec: FacetSpec): Promise<FilterOption[]> {
  // facet-excludes-itself: an active facet doesn't constrain its own option list.
  const active = ((filters[spec.key as keyof Filters] as FilterValue[] | undefined)?.length ?? 0) > 0
  const facetFilters = active ? ({ ...filters, [spec.key]: [] } as Filters) : filters
  const value = `coalesce(${spec.column}, '')`
  const q = buildEntityAggregateQuery(spec.entity, facetFilters, access, `${value} as value, count(*)::int as count`, {
    groupBy: value,
  })
  const rows = await queryWarehouse<{ value: string | null; count: number }>(q)
  return rows
    .map((r) => ({ value: String(r.value ?? ""), count: Number(r.count) }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

async function minMax(table: string, column: string): Promise<{ min: number; max: number }> {
  const rows = await queryWarehouse<{ min: number | null; max: number | null }>({
    text: `select min(${column})::float8 as min, max(${column})::float8 as max from ${table} where ${column} is not null and ${column} > 0`,
    values: [],
  })
  const r = rows[0]
  if (!r || r.min == null || r.max == null) return { min: 0, max: 1000000 }
  return { min: Number(r.min), max: Number(r.max) }
}

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "dashboard:facets" })
  if (!limited.ok) return limited.response

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }
  const filters = parseFilters((rawBody as { filters?: unknown })?.filters)
  const access = resolveAccess()

  try {
    const [facetEntries, revenue, yearsInIndia, centerIncYear] = await Promise.all([
      Promise.all(FACETS.map(async (spec) => [spec.key, await facetOptions(filters, access, spec)] as const)),
      minMax("accounts", "account_hq_revenue"),
      minMax("accounts", "years_in_india"),
      minMax("centers", "center_inc_year"),
    ])
    const options = Object.fromEntries(facetEntries) as unknown as AvailableOptions
    return json({ options, ranges: { revenue, yearsInIndia, centerIncYear } })
  } catch (err) {
    logger.error("facets_failed", { error: err })
    return json({ error: "Failed to compute facets" }, 500)
  }
}
