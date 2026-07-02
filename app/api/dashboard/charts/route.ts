import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { buildEntityAggregateQuery, type AggregateEntity, type FilterAccess } from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"
import type { ChartData, Filters } from "@/lib/types"

export const dynamic = "force-dynamic"

const logger = createLogger("api/dashboard/charts")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// Grouped counts over an entity's filtered set. Value coercion matches the
// client (String(x ?? "") || "Unknown"): null/empty become "Unknown".
async function grouped(entity: AggregateEntity, filters: Filters, access: FilterAccess, column: string): Promise<ChartData[]> {
  const name = `case when ${column} is null or ${column} = '' then 'Unknown' else ${column} end`
  const q = buildEntityAggregateQuery(entity, filters, access, `${name} as name, count(*)::int as value`, { groupBy: name })
  const rows = await queryWarehouse<{ name: string; value: number }>(q)
  return rows
    .map((r) => ({ name: String(r.name), value: Number(r.value) }))
    .sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// Top 10 (calculateChartData / calculateCenterChartData / calculateFunctionChartData).
const top10 = (rows: ChartData[]): ChartData[] => rows.slice(0, 10)

// Top 5 + "Others" (calculateCityChartData).
function cityBucket(rows: ChartData[]): ChartData[] {
  if (rows.length <= 5) return rows
  const top5 = rows.slice(0, 5)
  const others = rows.slice(5).reduce((sum, r) => sum + r.value, 0)
  if (others > 0) top5.push({ name: "Others", value: others })
  return top5
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
  const limited = await enforceRateLimit({ userId, bucket: "dashboard:charts" })
  if (!limited.ok) return limited.response

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }
  const filters = parseFilters((rawBody as { filters?: unknown })?.filters)
  const access = resolveAccess()
  const g = (entity: AggregateEntity, column: string) => grouped(entity, filters, access, column)

  try {
    const [
      accCountry, accCategory, accRevenue, accEmployees,
      cenType, cenEmployees, cenCity, cenFunction,
      proDept, proLevel, proCity,
    ] = await Promise.all([
      g("accounts", "account_hq_country"),
      g("accounts", "account_primary_category"),
      g("accounts", "account_hq_revenue_range"),
      g("accounts", "account_center_employees_range"),
      g("centers", "center_type"),
      g("centers", "center_employees_range"),
      g("centers", "center_city"),
      g("functions", "function_name"),
      g("prospects", "prospect_department"),
      g("prospects", "prospect_level"),
      g("prospects", "prospect_city"),
    ])

    return json({
      account: {
        regionData: top10(accCountry),
        primaryNatureData: top10(accCategory),
        revenueRangeData: top10(accRevenue),
        employeesRangeData: top10(accEmployees),
      },
      center: {
        centerTypeData: top10(cenType),
        employeesRangeData: top10(cenEmployees),
        cityData: cityBucket(cenCity),
        functionData: top10(cenFunction),
      },
      prospect: {
        departmentData: top10(proDept),
        levelData: top10(proLevel),
        cityData: top10(proCity),
      },
    })
  } catch (err) {
    logger.error("charts_failed", { error: err })
    return json({ error: "Failed to compute charts" }, 500)
  }
}
