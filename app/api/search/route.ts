import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { buildAccountSearch, buildCenterSearch, buildProspectSearch, MIN_QUERY_LENGTH } from "@/lib/search/search-sql"
import { ACCOUNT_PROJECTION, CENTER_COLUMNS, PROSPECT_COLUMNS } from "@/lib/dashboard/entity-columns"

export const dynamic = "force-dynamic"

const logger = createLogger("api/search")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const joinParts = (parts: Array<string | null | undefined>, sep: string) =>
  parts.filter((p): p is string => Boolean(p)).join(sep)

const total = (rows: Record<string, unknown>[]) => Number(rows[0]?.total ?? 0)

// Full rows for the (at most 10) hits per group, keyed by id, so the client
// can open detail dialogs straight from a result like the in-browser index did.
async function hydrate(
  table: "accounts" | "centers" | "prospects",
  keyColumn: string,
  projection: string,
  ids: Array<string | null>
): Promise<Map<string, Record<string, unknown>>> {
  const keys = ids.filter((id): id is string => Boolean(id))
  if (keys.length === 0) return new Map()
  const rows = await queryWarehouse<Record<string, unknown>>({
    text: `select ${projection} from ${table} where ${keyColumn} = any($1::text[])`,
    values: [keys],
  })
  return new Map(rows.map((r) => [String(r[keyColumn]), r]))
}

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

    const [accountRows, centerRows, prospectRows] = await Promise.all([
      hydrate("accounts", "account_global_legal_name", ACCOUNT_PROJECTION, aItems.map((r) => r.id)),
      hydrate("centers", "cn_unique_key", CENTER_COLUMNS.join(", "), cItems.map((r) => r.id)),
      hydrate("prospects", "ps_unique_key", PROSPECT_COLUMNS.join(", "), pItems.map((r) => r.id)),
    ])

    const accounts = {
      items: aItems.map((r) => ({
        type: "account" as const,
        id: r.id,
        title: r.id,
        subtitle: joinParts([r.industry, r.country], " · "),
        data: r.id ? accountRows.get(r.id) : undefined,
      })),
      totalMatches: total(aCount),
    }
    const centers = {
      items: cItems.map((r) => ({
        type: "center" as const,
        id: r.id,
        title: r.title,
        subtitle: joinParts([r.city, r.state, r.country], ", "),
        data: r.id ? centerRows.get(r.id) : undefined,
      })),
      totalMatches: total(cCount),
    }
    const prospects = {
      items: pItems.map((r) => ({
        type: "prospect" as const,
        id: r.id || `${r.account}::${r.fullname}`,
        title: r.fullname || "Unknown",
        subtitle: joinParts([r.title, r.account], " · "),
        data: r.id ? prospectRows.get(r.id) : undefined,
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
