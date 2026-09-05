import type { SqlQuery } from "@/lib/dashboard/filtering-sql"

/**
 * SQL builders for global search + account autocomplete. These reproduce the
 * in-browser search (lib/search/index.ts) over raw warehouse data with ILIKE,
 * matching the same fields and the startsWith-before-contains ranking. Alias
 * matching is expressed as a NON-correlated subquery so it stays pg-mem
 * testable. Concatenation-spanning matches (a term straddling the space between
 * two searchText parts) are intentionally not reproduced (negligible).
 */

export const MAX_PER_GROUP = 10
export const MAX_AUTOCOMPLETE = 50
export const MIN_QUERY_LENGTH = 2

const ALIAS_FIELDS = ["abbreviated_name", "brand_name", "short_legal_name", "currently_known_as", "flagship_products"] as const

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1")
}

function patterns(term: string): { starts: string; contains: string } {
  const e = escapeLike(term)
  return { starts: `${e}%`, contains: `%${e}%` }
}

const aliasInSubquery = (p: string) =>
  `account_global_legal_name in (select account_global_legal_name from alias where ${ALIAS_FIELDS.map((f) => `${f} ilike ${p}`).join(" or ")})`

export type SearchQueries = { items: SqlQuery; count: SqlQuery }

export function buildAccountSearch(term: string): SearchQueries {
  const { starts, contains } = patterns(term)
  const where = (p: string) =>
    `(account_global_legal_name ilike ${p} or account_hq_industry ilike ${p} or account_hq_country ilike ${p} or ${aliasInSubquery(p)})`
  return {
    items: {
      text: `select account_global_legal_name as id, account_hq_industry as industry, account_hq_country as country,
        (case when account_global_legal_name ilike $1 then 1 else 0 end) as sw
        from accounts where ${where("$2")}
        order by sw desc, account_global_legal_name asc limit ${MAX_PER_GROUP}`,
      values: [starts, contains],
    },
    count: { text: `select count(*)::int as total from accounts where ${where("$1")}`, values: [contains] },
  }
}

const CENTER_TITLE = "case when center_name is null or center_name = '' then cn_unique_key else center_name end"

export function buildCenterSearch(term: string): SearchQueries {
  const { starts, contains } = patterns(term)
  const where = (p: string) =>
    `((${CENTER_TITLE}) ilike ${p} or account_global_legal_name ilike ${p} or center_city ilike ${p} or center_state ilike ${p})`
  return {
    items: {
      text: `select cn_unique_key as id, (${CENTER_TITLE}) as title, center_city as city, center_state as state, center_country as country,
        (case when (${CENTER_TITLE}) ilike $1 then 1 else 0 end) as sw
        from centers where ${where("$2")}
        order by sw desc, title asc, cn_unique_key asc limit ${MAX_PER_GROUP}`,
      values: [starts, contains],
    },
    count: { text: `select count(*)::int as total from centers where ${where("$1")}`, values: [contains] },
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

export function buildProspectSearch(term: string): SearchQueries {
  const { starts, contains } = patterns(term)
  const where = (p: string) =>
    `((${PROSPECT_FULLNAME}) ilike ${p} or prospect_title ilike ${p} or head_type ilike ${p} or account_global_legal_name ilike ${p} or center_name ilike ${p} or prospect_email ilike ${p} or ps_unique_key ilike ${p})`
  return {
    items: {
      text: `select ps_unique_key as id, (${PROSPECT_FULLNAME}) as fullname, prospect_title as title, account_global_legal_name as account,
        (case when (${PROSPECT_FULLNAME}) ilike $1 then 1 else 0 end) as sw
        from prospects where ${where("$2")}
        order by sw desc, fullname asc, ps_unique_key asc limit ${MAX_PER_GROUP}`,
      values: [starts, contains],
    },
    count: { text: `select count(*)::int as total from prospects where ${where("$1")}`, values: [contains] },
  }
}

export function buildAccountAutocomplete(term: string): SqlQuery {
  const { starts, contains } = patterns(term)
  return {
    text: `select account_global_legal_name as name,
      account_visibility as visibility, account_visibility_note as visibility_note,
      (case when account_global_legal_name ilike $1 then 1 else 0 end) as sw,
      (case when account_global_legal_name ilike $2 then 1 else 0 end) as namematch
      from accounts
      where account_global_legal_name ilike $2 or ${aliasInSubquery("$2")}
      order by sw desc, account_global_legal_name asc limit ${MAX_AUTOCOMPLETE}`,
    values: [starts, contains],
  }
}

/** Alias rows (all fields) for the given accounts matching the term, to resolve "Known as". */
export function buildAliasMatches(names: string[], term: string): SqlQuery {
  const { contains } = patterns(term)
  return {
    text: `select account_global_legal_name, ${ALIAS_FIELDS.join(", ")}
      from alias
      where account_global_legal_name = any($1::text[]) and (${ALIAS_FIELDS.map((f) => `${f} ilike $2`).join(" or ")})`,
    values: [names, contains],
  }
}

export type AliasMatch = { field: (typeof ALIAS_FIELDS)[number]; value: string }

/**
 * Mirrors findAliasMatch: the first alias field (in field order, across all of
 * the account's alias rows) whose value contains the term.
 */
export function firstAliasMatch(rows: Record<string, unknown>[] | undefined, term: string): AliasMatch | null {
  if (!rows || rows.length === 0) return null
  const lowered = term.toLowerCase()
  for (const field of ALIAS_FIELDS) {
    for (const row of rows) {
      const value = row[field]
      if (typeof value === "string" && value.toLowerCase().includes(lowered)) {
        return { field, value }
      }
    }
  }
  return null
}
