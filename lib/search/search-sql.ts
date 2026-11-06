import type { SqlQuery } from "@/lib/dashboard/filtering-sql"
import { APOSTROPHES, searchKey } from "@/lib/search/normalize"

/**
 * SQL builders for global search + account autocomplete. These reproduce the
 * in-browser search (lib/search/index.ts) over raw warehouse data with ILIKE,
 * matching the same fields and the startsWith-before-contains ranking. Alias
 * matching is expressed as a NON-correlated subquery so it stays pg-mem
 * testable. Concatenation-spanning matches (a term straddling the space between
 * two searchText parts) are intentionally not reproduced (negligible).
 */

export const MAX_PER_GROUP = 10
/** Results for one type when search is narrowed to it ("Show all centres"). */
export const MAX_SINGLE_GROUP = 50
export const MAX_AUTOCOMPLETE = 50
export const MIN_QUERY_LENGTH = 2

const ALIAS_FIELDS = ["abbreviated_name", "brand_name", "short_legal_name", "currently_known_as", "flagship_products"] as const

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1")
}

// Names mix straight and curly apostrophes ("O'Reilly" vs "O’Reilly"). An
// apostrophe in the term becomes the one-character wildcard, so either
// spelling finds both, like the in-browser search, while the columns stay
// plain (no per-row rewriting, and an index on them stays usable).
type Matcher = { starts: string; contains: string; like: (expr: string, param: string) => string }

function matcher(term: string): Matcher {
  const e = escapeLike(term).replace(APOSTROPHES, "_")
  return {
    starts: `${e}%`,
    contains: `%${e}%`,
    like: (expr, param) => `${expr} ilike ${param}`,
  }
}

const aliasInSubquery = (m: Matcher, p: string) =>
  `account_global_legal_name in (select account_global_legal_name from alias where ${ALIAS_FIELDS.map((f) => m.like(f, p)).join(" or ")})`

export type SearchQueries = { items: SqlQuery; count: SqlQuery }

export function buildAccountSearch(term: string, limit: number = MAX_PER_GROUP): SearchQueries {
  const m = matcher(term)
  const where = (p: string) =>
    `(${m.like("account_global_legal_name", p)} or ${m.like("account_hq_industry", p)} or ${m.like("account_hq_country", p)} or ${aliasInSubquery(m, p)})`
  return {
    items: {
      text: `select account_global_legal_name as id, account_hq_industry as industry, account_hq_country as country,
        (case when ${m.like("account_global_legal_name", "$1")} then 1 else 0 end) as sw
        from accounts where ${where("$2")}
        order by sw desc, account_global_legal_name asc limit ${Math.max(1, Math.floor(limit))}`,
      values: [m.starts, m.contains],
    },
    count: { text: `select count(*)::int as total from accounts where ${where("$1")}`, values: [m.contains] },
  }
}

const CENTER_TITLE = "case when center_name is null or center_name = '' then cn_unique_key else center_name end"

export function buildCenterSearch(term: string, limit: number = MAX_PER_GROUP): SearchQueries {
  const m = matcher(term)
  const fields = [`(${CENTER_TITLE})`, "account_global_legal_name", "center_city", "center_state"]
  const where = (p: string) => `(${fields.map((f) => m.like(f, p)).join(" or ")})`
  return {
    items: {
      text: `select cn_unique_key as id, (${CENTER_TITLE}) as title, center_city as city, center_state as state, center_country as country,
        (case when ${m.like(`(${CENTER_TITLE})`, "$1")} then 1 else 0 end) as sw
        from centers where ${where("$2")}
        order by sw desc, title asc, cn_unique_key asc limit ${Math.max(1, Math.floor(limit))}`,
      values: [m.starts, m.contains],
    },
    count: { text: `select count(*)::int as total from centers where ${where("$1")}`, values: [m.contains] },
  }
}

// full_name, else first+last joined (equivalent to `${first} ${last}`.trim()),
// written without trim() for pg-mem compatibility.
const PROSPECT_FULLNAME =
  "case " +
  "when prospect_full_name is not null and prospect_full_name <> '' then prospect_full_name " +
  "when coalesce(prospect_first_name, '') <> '' and coalesce(prospect_last_name, '') <> '' then prospect_first_name || ' ' || prospect_last_name " +
  "when coalesce(prospect_first_name, '') <> '' then prospect_first_name " +
  "when coalesce(prospect_last_name, '') <> '' then prospect_last_name " +
  "else '' end"

export function buildProspectSearch(term: string, limit: number = MAX_PER_GROUP): SearchQueries {
  const m = matcher(term)
  const fields = [`(${PROSPECT_FULLNAME})`, "prospect_title", "head_type", "account_global_legal_name", "center_name", "prospect_email", "ps_unique_key"]
  const where = (p: string) => `(${fields.map((f) => m.like(f, p)).join(" or ")})`
  return {
    items: {
      text: `select ps_unique_key as id, (${PROSPECT_FULLNAME}) as fullname, prospect_title as title, account_global_legal_name as account,
        (case when ${m.like(`(${PROSPECT_FULLNAME})`, "$1")} then 1 else 0 end) as sw
        from prospects where ${where("$2")}
        order by sw desc, fullname asc, ps_unique_key asc limit ${Math.max(1, Math.floor(limit))}`,
      values: [m.starts, m.contains],
    },
    count: { text: `select count(*)::int as total from prospects where ${where("$1")}`, values: [m.contains] },
  }
}

export function buildAccountAutocomplete(term: string): SqlQuery {
  const m = matcher(term)
  return {
    text: `select account_global_legal_name as name,
      account_visibility as visibility, account_visibility_note as visibility_note,
      (case when ${m.like("account_global_legal_name", "$1")} then 1 else 0 end) as sw,
      (case when ${m.like("account_global_legal_name", "$2")} then 1 else 0 end) as namematch
      from accounts
      where ${m.like("account_global_legal_name", "$2")} or ${aliasInSubquery(m, "$2")}
      order by sw desc, account_global_legal_name asc limit ${MAX_AUTOCOMPLETE}`,
    values: [m.starts, m.contains],
  }
}

/** Alias rows (all fields) for the given accounts matching the term, to resolve "Known as". */
export function buildAliasMatches(names: string[], term: string): SqlQuery {
  const m = matcher(term)
  return {
    text: `select account_global_legal_name, ${ALIAS_FIELDS.join(", ")}
      from alias
      where account_global_legal_name = any($1::text[]) and (${ALIAS_FIELDS.map((f) => m.like(f, "$2")).join(" or ")})`,
    values: [names, m.contains],
  }
}

export type AliasMatch = { field: (typeof ALIAS_FIELDS)[number]; value: string }

/**
 * Mirrors findAliasMatch: the first alias field (in field order, across all of
 * the account's alias rows) whose value contains the term.
 */
export function firstAliasMatch(rows: Record<string, unknown>[] | undefined, term: string): AliasMatch | null {
  if (!rows || rows.length === 0) return null
  const lowered = searchKey(term)
  for (const field of ALIAS_FIELDS) {
    for (const row of rows) {
      const value = row[field]
      if (typeof value === "string" && searchKey(value).includes(lowered)) {
        return { field, value }
      }
    }
  }
  return null
}
