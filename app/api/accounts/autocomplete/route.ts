import { extractBearerToken, resolveAuthenticatedUserId } from "@/lib/auth/server"
import { enforceRateLimit } from "@/lib/rate-limit/server"
import { createLogger } from "@/lib/logger"
import { queryWarehouse } from "@/lib/db/warehouse"
import { buildAccountAutocomplete, buildAliasMatches, firstAliasMatch, MIN_QUERY_LENGTH } from "@/lib/search/search-sql"

export const dynamic = "force-dynamic"

const logger = createLogger("api/accounts/autocomplete")

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
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
  const limited = await enforceRateLimit({ userId, bucket: "autocomplete" })
  if (!limited.ok) return limited.response

  const term = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase().trim()
  if (term.length < MIN_QUERY_LENGTH) return json({ suggestions: [] })

  try {
    const rows = await queryWarehouse<{ name: string; sw: number; namematch: number }>(buildAccountAutocomplete(term))

    // Resolve "Known as" alias matches for accounts that did not match by name.
    const aliasNeeded = rows.filter((r) => Number(r.namematch) !== 1).map((r) => r.name)
    const aliasByAccount = new Map<string, Record<string, unknown>[]>()
    if (aliasNeeded.length > 0) {
      const aliasRows = await queryWarehouse<Record<string, unknown>>(buildAliasMatches(aliasNeeded, term))
      for (const ar of aliasRows) {
        const key = String(ar.account_global_legal_name)
        const list = aliasByAccount.get(key)
        if (list) list.push(ar)
        else aliasByAccount.set(key, [ar])
      }
    }

    const suggestions = rows.map((r) => {
      const name = String(r.name)
      const matchedAlias = Number(r.namematch) === 1 ? null : firstAliasMatch(aliasByAccount.get(name), term)
      return matchedAlias ? { value: name, matchedAlias } : { value: name }
    })

    return json({ suggestions })
  } catch (err) {
    logger.error("autocomplete_failed", { error: err })
    return json({ error: "Autocomplete failed" }, 500)
  }
}
