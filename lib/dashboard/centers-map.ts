import type { Filters } from "@/lib/types"
import { buildEntityAggregateQuery, buildEntityUnionQuery, type AggregateBranch, type FilterAccess, type SqlQuery } from "@/lib/dashboard/filtering-sql"

/**
 * Server-side aggregations for the centers maps, replacing the in-browser
 * cityData (components/maps/centers-map.tsx) and buildStateAggregates
 * (components/maps/centers-choropleth-map.tsx) computations over the full
 * centers array. Both run over the filtered centers set via the shared
 * filtering-sql cascade.
 */

export type CityMapRow = {
  city: string
  country: string
  lat: number
  lng: number
  count: number
  accounts_count: number
  headcount: number
}

export type StateMapRow = {
  country_iso2: string
  state_key: string
  country_name: string | null
  count: number
  accounts_count: number
  headcount: number
}

/**
 * One row per city over the filtered centers that have coordinates.
 * Mirrors the client cityData: group by center_city; country and lat/lng come
 * from the first matching center in center_name order (the order the client
 * receives centers in); headcount sums center_employees.
 */
const CITY_BRANCH: AggregateBranch = {
  select: [
    "center_city as city",
    "(array_agg(coalesce(center_country, '') order by center_name asc))[1] as country",
    "((array_agg(lat order by center_name asc))[1])::float8 as lat",
    "((array_agg(lng order by center_name asc))[1])::float8 as lng",
    "count(*)::int as count",
    "count(distinct account_global_legal_name)::int as accounts_count",
    "coalesce(sum(coalesce(center_employees, 0)), 0)::int as headcount",
  ].join(", "),
  where: "lat is not null and lng is not null and center_city is not null and center_city <> ''",
  groupBy: "center_city",
}

export function buildCityMapQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  return buildEntityAggregateQuery("centers", f, access, CITY_BRANCH.select, { where: CITY_BRANCH.where, groupBy: CITY_BRANCH.groupBy })
}

/**
 * One row per (country ISO2, state) over the filtered centers. Mirrors the
 * client buildStateAggregates: keys are upper(trim(iso2)) and
 * lower(trim(state)), accounts count only non-empty account names, headcount
 * sums center_employees. country_name is a representative center_country for
 * the group (the client keeps one name per ISO2 the same way).
 */
const STATE_BRANCH: AggregateBranch = {
  select: [
    "upper(trim(center_country_iso2)) as country_iso2",
    "lower(trim(center_state)) as state_key",
    "max(center_country) as country_name",
    "count(*)::int as count",
    "(count(distinct account_global_legal_name) filter (where account_global_legal_name is not null and account_global_legal_name <> ''))::int as accounts_count",
    "coalesce(sum(coalesce(center_employees, 0)), 0)::int as headcount",
  ].join(", "),
  where:
    "center_state is not null and trim(center_state) <> '' and center_country_iso2 is not null and trim(center_country_iso2) <> ''",
  groupBy: "upper(trim(center_country_iso2)), lower(trim(center_state))",
}

export function buildStateMapQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  return buildEntityAggregateQuery("centers", f, access, STATE_BRANCH.select, { where: STATE_BRANCH.where, groupBy: STATE_BRANCH.groupBy })
}

/** A city or state row from the combined statement, discriminated by `kind`. */
export type CentersMapRow =
  | ({ kind: "city" } & CityMapRow)
  | ({ kind: "state" } & StateMapRow)

/**
 * City and state aggregates in ONE statement: the filtered-centers cascade is
 * evaluated once and the two groupings are union-all branches over it. Both
 * branches project the same column list (`kind`, three text keys, two
 * coordinates, three counts) so the union lines up; the columns unused by a
 * branch are null. Rows split back by `kind`.
 */
export function buildCentersMapQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const cityCols = CITY_BRANCH.select
    .replace("center_city as city", "'city' as kind, center_city as key1, null::text as key2")
    .replace(" as country,", " as name,")
  const stateCols = STATE_BRANCH.select
    .replace("upper(trim(center_country_iso2)) as country_iso2", "'state' as kind, upper(trim(center_country_iso2)) as key1")
    .replace("lower(trim(center_state)) as state_key", "lower(trim(center_state)) as key2")
    .replace("max(center_country) as country_name", "max(center_country) as name, null::float8 as lat, null::float8 as lng")
  return buildEntityUnionQuery("centers", f, access, [
    { ...CITY_BRANCH, select: cityCols },
    { ...STATE_BRANCH, select: stateCols },
  ])
}

/** Splits the combined statement's rows into typed city and state rows. */
export function splitCentersMapRows(
  rows: { kind: string; key1: string; key2: string | null; name: string | null; lat: number | null; lng: number | null; count: number; accounts_count: number; headcount: number }[]
): { cities: CityMapRow[]; states: StateMapRow[] } {
  const cities: CityMapRow[] = []
  const states: StateMapRow[] = []
  for (const r of rows) {
    if (r.kind === "city") {
      cities.push({ city: r.key1, country: r.name ?? "", lat: Number(r.lat), lng: Number(r.lng), count: r.count, accounts_count: r.accounts_count, headcount: r.headcount })
    } else if (r.kind === "state") {
      states.push({ country_iso2: r.key1, state_key: r.key2 ?? "", country_name: r.name, count: r.count, accounts_count: r.accounts_count, headcount: r.headcount })
    }
  }
  return { cities, states }
}
