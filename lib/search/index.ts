import type { Account, Center, Prospect } from "@/lib/types"

export type SearchResultType = "account" | "center" | "prospect"

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  meta: string
  data: Account | Center | Prospect
}

interface SearchIndex {
  accounts: { searchText: string; result: SearchResult }[]
  centers: { searchText: string; result: SearchResult }[]
  prospects: { searchText: string; result: SearchResult }[]
}

export function buildSearchIndex(
  accounts: Account[],
  centers: Center[],
  prospects: Prospect[]
): SearchIndex {
  const accountEntries = accounts.map((a) => {
    const name = a.account_global_legal_name
    const industry = a.account_hq_industry ?? ""
    const country = a.account_hq_country ?? ""

    return {
      searchText: [name, industry, country].join(" ").toLowerCase(),
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
    const email = p.prospect_email ?? ""

    return {
      searchText: [fullName, title, headType, account, email].join(" ").toLowerCase(),
      result: {
        type: "prospect" as const,
        id: `${account}::${fullName}`,
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

  const accounts = searchGroup(index.accounts)
  const centers = searchGroup(index.centers)
  const prospects = searchGroup(index.prospects)

  return {
    accounts,
    centers,
    prospects,
    total: accounts.totalMatches + centers.totalMatches + prospects.totalMatches,
  }
}
