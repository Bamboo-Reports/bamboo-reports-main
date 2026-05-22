import type { Account, Alias, Center, Prospect } from "@/lib/types"
import { aliasSearchText, buildAliasMap, findAliasMatch, type AliasMatch } from "@/lib/search/alias-utils"

export type SearchResultType = "account" | "center" | "prospect"

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  meta: string
  data: Account | Center | Prospect
  matchedAlias?: AliasMatch
}

interface AccountIndexEntry {
  searchText: string
  result: SearchResult
  aliases: Alias[]
  nameLower: string
}

interface SearchIndex {
  accounts: AccountIndexEntry[]
  centers: { searchText: string; result: SearchResult }[]
  prospects: { searchText: string; result: SearchResult }[]
}

export function buildSearchIndex(
  accounts: Account[],
  centers: Center[],
  prospects: Prospect[],
  aliases: Alias[] = []
): SearchIndex {
  const aliasMap = buildAliasMap(aliases)

  const accountEntries: AccountIndexEntry[] = accounts.map((a) => {
    const name = a.account_global_legal_name
    const industry = a.account_hq_industry ?? ""
    const country = a.account_hq_country ?? ""
    const nameLower = name.toLowerCase()
    const accountAliases = aliasMap.get(nameLower) ?? []
    const aliasText = aliasSearchText(accountAliases)

    return {
      searchText: [name, industry, country, aliasText].filter(Boolean).join(" ").toLowerCase(),
      nameLower,
      aliases: accountAliases,
      result: {
        type: "account" as const,
        id: name,
        title: name,
        subtitle: [industry, country].filter(Boolean).join(" · "),
        meta: "",
        data: a,
      },
    }
  })

  const centerEntries = centers.map((c) => {
    const name = c.center_name ?? c.cn_unique_key
    const account = c.account_global_legal_name
    const city = c.center_city ?? ""
    const state = c.center_state ?? ""

    return {
      searchText: [name, account, city, state].join(" ").toLowerCase(),
      result: {
        type: "center" as const,
        id: c.cn_unique_key,
        title: name,
        subtitle: [city, state, c.center_country].filter(Boolean).join(", "),
        meta: "",
        data: c,
      },
    }
  })

  const prospectEntries = prospects.map((p) => {
    const fullName = p.prospect_full_name ?? `${p.prospect_first_name ?? ""} ${p.prospect_last_name ?? ""}`.trim()
    const title = p.prospect_title ?? ""
    const headType = p.head_type ?? ""
    const account = p.account_global_legal_name
    const center = p.center_name ?? ""
    const email = p.prospect_email ?? ""
    const uniqueKey = p.ps_unique_key ?? ""

    return {
      searchText: [fullName, title, headType, account, center, email, uniqueKey].join(" ").toLowerCase(),
      result: {
        type: "prospect" as const,
        id: uniqueKey || `${account}::${fullName}`,
        title: fullName || "Unknown",
        subtitle: [title, account].filter(Boolean).join(" · "),
        meta: "",
        data: p,
      },
    }
  })

  return {
    accounts: accountEntries,
    centers: centerEntries,
    prospects: prospectEntries,
  }
}

const MAX_RENDERED_PER_GROUP = 10
const MIN_QUERY_LENGTH = 2

export interface GroupedResults {
  items: SearchResult[]
  totalMatches: number
}

export function searchIndex(
  index: SearchIndex,
  query: string
): { accounts: GroupedResults; centers: GroupedResults; prospects: GroupedResults; total: number } {
  const empty: GroupedResults = { items: [], totalMatches: 0 }

  if (query.trim().length < MIN_QUERY_LENGTH) {
    return { accounts: empty, centers: empty, prospects: empty, total: 0 }
  }

  const term = query.toLowerCase().trim()

  const searchGroup = (
    entries: { searchText: string; result: SearchResult }[]
  ): GroupedResults => {
    const startsWithMatches: SearchResult[] = []
    const containsMatches: SearchResult[] = []

    for (const entry of entries) {
      if (entry.searchText.startsWith(term) || entry.result.title.toLowerCase().startsWith(term)) {
        startsWithMatches.push(entry.result)
      } else if (entry.searchText.includes(term)) {
        containsMatches.push(entry.result)
      }
    }

    const all = [...startsWithMatches, ...containsMatches]
    return {
      items: all.slice(0, MAX_RENDERED_PER_GROUP),
      totalMatches: all.length,
    }
  }

  const searchAccounts = (entries: AccountIndexEntry[]): GroupedResults => {
    const startsWithMatches: SearchResult[] = []
    const containsMatches: SearchResult[] = []

    for (const entry of entries) {
      const matchedByName =
        entry.nameLower.startsWith(term) || entry.nameLower.includes(term)
      const matchedAlias = matchedByName ? null : findAliasMatch(entry.aliases, term)

      if (!matchedByName && !matchedAlias && !entry.searchText.includes(term)) {
        continue
      }

      const result: SearchResult = matchedAlias
        ? { ...entry.result, matchedAlias }
        : entry.result

      if (entry.nameLower.startsWith(term) || entry.searchText.startsWith(term)) {
        startsWithMatches.push(result)
      } else {
        containsMatches.push(result)
      }
    }

    const all = [...startsWithMatches, ...containsMatches]
    return {
      items: all.slice(0, MAX_RENDERED_PER_GROUP),
      totalMatches: all.length,
    }
  }

  const accounts = searchAccounts(index.accounts)
  const centers = searchGroup(index.centers)
  const prospects = searchGroup(index.prospects)

  return {
    accounts,
    centers,
    prospects,
    total: accounts.totalMatches + centers.totalMatches + prospects.totalMatches,
  }
}
