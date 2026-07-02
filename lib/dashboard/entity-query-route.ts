import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { parseFilters, resolveAccess } from "@/lib/dashboard/filters-request"
import { queryEntity, type QueryEntity } from "@/lib/dashboard/entity-query"

const logger = createLogger("api/entity-query")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * Shared handler for the paginated per-entity query routes
 * (/api/accounts/query, /api/centers/query, /api/prospects/query).
 * Body: { filters, page, pageSize, sort: { column, direction } }.
 */
export async function handleEntityQuery(entity: QueryEntity, request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: `${entity}:query` })
  if (!limited.ok) return limited.response

  let body: { filters?: unknown; page?: unknown; pageSize?: unknown; sort?: { column?: unknown; direction?: unknown } }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }
  const filters = parseFilters(body?.filters)
  const access = resolveAccess()

  try {
    const result = await queryEntity(entity, filters, access, {
      page: body?.page,
      pageSize: body?.pageSize,
      sort: body?.sort,
    })
    return json(result)
  } catch (err) {
    logger.error("entity_query_failed", { entity, error: err })
    return json({ error: "Query failed" }, 500)
  }
}
