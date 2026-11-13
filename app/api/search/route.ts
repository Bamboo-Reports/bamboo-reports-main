import { authenticateRequest } from "@/lib/auth/request"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { knownText } from "@/lib/utils/helpers"
import { buildAccountSearch, buildCenterSearch, buildProspectSearch, MAX_PER_GROUP, MAX_SINGLE_GROUP, MIN_QUERY_LENGTH } from "@/lib/search/search-sql"
import { ACCOUNT_PROJECTION, CENTER_COLUMNS, PROSPECT_COLUMNS } from "@/lib/dashboard/entity-columns"
import { dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"

export const dynamic = "force-dynamic"

const logger = createLogger("api/search")

// Results depend only on the query term (warehouse data is weekly-static), so
// they cache under the shared dash: prefix and the ETL purge clears them on
// import. 24h bounds keyspace growth from high-cardinality terms; TTL 0 on
// DASHBOARD_CACHE_TTL_MS still disables caching globally.
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function searchCacheTtl(): number {
  return dashboardCacheTtlMs() === 0 ? 0 : SEARCH_CACHE_TTL_MS
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// Blank and "TBA" parts are left out, so a centre with no city yet reads "India", not "TBA, TBA, India".
const joinParts = (parts: Array<string | null | undefined>, sep: string) =>
  parts.map(knownText).filter((p): p is string => p !== null).join(sep)

const total = (rows: Record<string, unknown>[]) => Number(rows[0]?.total ?? 0)

// Full rows for the hits per group (10, or 50 for the type search is narrowed to), keyed by id, so the client
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
  const auth = await authenticateRequest(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  // Started now so the counter round trip overlaps the request parsing below;
  // awaited before any warehouse work so an over-limit caller never reaches it.
  const limitedPromise = enforceRateLimit({ userId, bucket: "search" })

  const params = new URL(request.url).searchParams
  const term = (params.get("q") ?? "").toLowerCase().trim()
  // Narrowed to one type ("Show all centres"): that group returns more hits.
  const rawType = params.get("type")
  const focus = rawType === "accounts" || rawType === "centers" || rawType === "prospects" ? rawType : null
  const limitFor = (group: "accounts" | "centers" | "prospects") => (group === focus ? MAX_SINGLE_GROUP : MAX_PER_GROUP)
  const empty = { items: [], totalMatches: 0 }
  if (term.length < MIN_QUERY_LENGTH) {
    return json({ accounts: empty, centers: empty, prospects: empty, total: 0 })
  }

  const limited = await limitedPromise
  if (!limited.ok) return limited.response

  try {
    const body = await getOrCompute(
      `search:${focus ?? "all"}:${term}`,
      searchCacheTtl(),
      async () => {
        const acc = buildAccountSearch(term, limitFor("accounts"))
        const cen = buildCenterSearch(term, limitFor("centers"))
        const pro = buildProspectSearch(term, limitFor("prospects"))
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

        return {
          accounts,
          centers,
          prospects,
          total: accounts.totalMatches + centers.totalMatches + prospects.totalMatches,
        }
      },
      { bypassRead: request.headers.get("x-no-cache") === "1" }
    )
    return json(body)
  } catch (err) {
    logger.error("search_failed", { error: err })
    return json({ error: "Search failed" }, 500)
  }
}
