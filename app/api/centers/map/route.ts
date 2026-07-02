import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { buildCityMapQuery, buildStateMapQuery, type CityMapRow, type StateMapRow } from "@/lib/dashboard/centers-map"
import { queryWarehouse } from "@/lib/db/warehouse"

export const dynamic = "force-dynamic"

const logger = createLogger("api/centers/map")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Filter-aware map aggregations for the centers maps. Body: { filters }.
 * Returns { cities, states }: per-city bubbles (with representative coords)
 * and per-state choropleth aggregates over the filtered centers set.
 */
export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "centers:map" })
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
    const [cityRows, stateRows] = await Promise.all([
      queryWarehouse<CityMapRow>(buildCityMapQuery(filters, access)),
      queryWarehouse<StateMapRow>(buildStateMapQuery(filters, access)),
    ])
    return json({
      cities: cityRows.map((r) => ({
        city: r.city,
        country: r.country ?? "",
        lat: Number(r.lat),
        lng: Number(r.lng),
        count: Number(r.count),
        accountsCount: Number(r.accounts_count),
        headcount: Number(r.headcount),
      })),
      states: stateRows.map((r) => ({
        countryIso2: r.country_iso2,
        stateKey: r.state_key,
        countryName: r.country_name ?? r.country_iso2,
        count: Number(r.count),
        accountsCount: Number(r.accounts_count),
        headcount: Number(r.headcount),
      })),
    })
  } catch (err) {
    logger.error("centers_map_failed", { error: err })
    return json({ error: "Failed to compute map aggregates" }, 500)
  }
}
