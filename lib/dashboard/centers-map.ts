import type { Filters } from "@/lib/types"
import { buildEntityAggregateQuery, type FilterAccess, type SqlQuery } from "@/lib/dashboard/filtering-sql"

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
export function buildCityMapQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const select = [
    "center_city as city",
    "(array_agg(coalesce(center_country, '') order by center_name asc))[1] as country",
    "((array_agg(lat order by center_name asc))[1])::float8 as lat",
    "((array_agg(lng order by center_name asc))[1])::float8 as lng",
    "count(*)::int as count",
    "count(distinct account_global_legal_name)::int as accounts_count",
    "coalesce(sum(coalesce(center_employees, 0)), 0)::int as headcount",
  ].join(", ")
  return buildEntityAggregateQuery("centers", f, access, select, {
    where: "lat is not null and lng is not null and center_city is not null and center_city <> ''",
    groupBy: "center_city",
  })
}

/**
 * One row per (country ISO2, state) over the filtered centers. Mirrors the
 * client buildStateAggregates: keys are upper(trim(iso2)) and
 * lower(trim(state)), accounts count only non-empty account names, headcount
 * sums center_employees. country_name is a representative center_country for
 * the group (the client keeps one name per ISO2 the same way).
 */
export function buildStateMapQuery(f: Filters, access: FilterAccess = {}): SqlQuery {
  const select = [
    "upper(trim(center_country_iso2)) as country_iso2",
    "lower(trim(center_state)) as state_key",
    "max(center_country) as country_name",
    "count(*)::int as count",
    "(count(distinct account_global_legal_name) filter (where account_global_legal_name is not null and account_global_legal_name <> ''))::int as accounts_count",
    "coalesce(sum(coalesce(center_employees, 0)), 0)::int as headcount",
  ].join(", ")
  return buildEntityAggregateQuery("centers", f, access, select, {
    where:
      "center_state is not null and trim(center_state) <> '' and center_country_iso2 is not null and trim(center_country_iso2) <> ''",
    groupBy: "upper(trim(center_country_iso2)), lower(trim(center_state))",
  })
}
