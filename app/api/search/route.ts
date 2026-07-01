import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { buildAccountSearch, buildCenterSearch, buildProspectSearch, MIN_QUERY_LENGTH } from "@/lib/search/search-sql"

export const dynamic = "force-dynamic"

const logger = createLogger("api/search")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const joinParts = (parts: Array<string | null | undefined>, sep: string) =>
  parts.filter((p): p is string => Boolean(p)).join(sep)

const total = (rows: Record<string, unknown>[]) => Number(rows[0]?.total ?? 0)

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return json({ error: "Missing authorization token" }, 401)
  let userId: string
  try {
    userId = await resolveAuthenticatedUserId(token)
  } catch {
    return json({ error: "Invalid or expired token" }, 401)
  }
  const limited = await enforceRateLimit({ userId, bucket: "search" })
  if (!limited.ok) return limited.response

  const term = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase().trim()
  const empty = { items: [], totalMatches: 0 }
  if (term.length < MIN_QUERY_LENGTH) {
    return json({ accounts: empty, centers: empty, prospects: empty, total: 0 })
  }

  try {
    const acc = buildAccountSearch(term)
    const cen = buildCenterSearch(term)
    const pro = buildProspectSearch(term)
    const [aItems, aCount, cItems, cCount, pItems, pCount] = await Promise.all([
      queryWarehouse<Record<string, string | null>>(acc.items),
      queryWarehouse(acc.count),
      queryWarehouse<Record<string, string | null>>(cen.items),
      queryWarehouse(cen.count),
      queryWarehouse<Record<string, string | null>>(pro.items),
      queryWarehouse(pro.count),
    ])

    const accounts = {
      items: aItems.map((r) => ({
        type: "account" as const,
        id: r.id,
        title: r.id,
        subtitle: joinParts([r.industry, r.country], " · "),
      })),
      totalMatches: total(aCount),
    }
    const centers = {
      items: cItems.map((r) => ({
        type: "center" as const,
        id: r.id,
        title: r.title,
        subtitle: joinParts([r.city, r.state, r.country], ", "),
      })),
      totalMatches: total(cCount),
    }
    const prospects = {
      items: pItems.map((r) => ({
        type: "prospect" as const,
        id: r.id || `${r.account}::${r.fullname}`,
        title: r.fullname || "Unknown",
        subtitle: joinParts([r.title, r.account], " · "),
      })),
      totalMatches: total(pCount),
    }

    return json({
      accounts,
      centers,
      prospects,
      total: accounts.totalMatches + centers.totalMatches + prospects.totalMatches,
    })
  } catch (err) {
    logger.error("search_failed", { error: err })
    return json({ error: "Search failed" }, 500)
  }
}
