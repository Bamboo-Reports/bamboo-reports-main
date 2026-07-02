import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { buildCentersQuery, buildEntityAggregateQuery, type SqlQuery } from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"

export const dynamic = "force-dynamic"

const logger = createLogger("api/dashboard/summary")

// Centers count + upcoming + headcount in one pass. Headcount excludes the same
// center types as getDashboardSummaryMetrics (app/actions/data.ts).
const CENTER_METRICS =
  "count(*)::int as centers, " +
  "sum(case when center_status = 'Upcoming' then 1 else 0 end)::int as upcoming, " +
  "coalesce(sum(case when (center_type is null or lower(center_type) not in " +
  "('manufacturing', 'sales & marketing', 'bpo', 'distribution')) then center_employees else 0 end), 0)::int as headcount"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const num = (rows: Record<string, unknown>[], key: string) => Number(rows[0]?.[key] ?? 0)

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)

  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }

  const limited = await enforceRateLimit({ userId, bucket: "dashboard:summary" })
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
    // Filtered services = services rows of the surviving centers (services
    // have no filter engine of their own). Used by the export-by-filter dialog.
    const centersSub = buildCentersQuery(filters, access, { columns: "cn_unique_key", orderBy: null })
    const servicesFilteredQuery: SqlQuery = {
      text: `select count(*)::int as total from services where cn_unique_key in (${centersSub.text})`,
      values: centersSub.values,
    }

    const [accF, cenF, proF, svcF, accAll, cenAll, proAll, svcAll] = await Promise.all([
      queryWarehouse(buildEntityAggregateQuery("accounts", filters, access, "count(*)::int as total")),
      queryWarehouse(buildEntityAggregateQuery("centers", filters, access, CENTER_METRICS)),
      queryWarehouse(buildEntityAggregateQuery("prospects", filters, access, "count(*)::int as total")),
      queryWarehouse(servicesFilteredQuery),
      queryWarehouse({ text: "select count(*)::int as total from accounts", values: [] }),
      queryWarehouse({ text: `select ${CENTER_METRICS} from centers`, values: [] }),
      queryWarehouse({ text: "select count(*)::int as total from prospects", values: [] }),
      queryWarehouse({ text: "select count(*)::int as total from services", values: [] }),
    ])

    return json({
      filtered: {
        accounts: num(accF, "total"),
        centers: num(cenF, "centers"),
        upcomingCenters: num(cenF, "upcoming"),
        prospects: num(proF, "total"),
        headcount: num(cenF, "headcount"),
        services: num(svcF, "total"),
      },
      full: {
        accounts: num(accAll, "total"),
        centers: num(cenAll, "centers"),
        upcomingCenters: num(cenAll, "upcoming"),
        prospects: num(proAll, "total"),
        headcount: num(cenAll, "headcount"),
        services: num(svcAll, "total"),
      },
    })
  } catch (err) {
    logger.error("summary_failed", { error: err })
    return json({ error: "Failed to compute summary" }, 500)
  }
}
