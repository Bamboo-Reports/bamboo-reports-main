import "server-only"

import { buildCentersQuery, buildEntityAggregateQuery, buildFacetCountsQuery, type AggregateEntity, type FilterAccess, type SqlQuery } from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"
import { dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"
import type { FacetsResponse, SummaryResponse } from "@/lib/dashboard/api-client"
import type { AvailableOptions, FilterOption, FilterValue, Filters } from "@/lib/types"

/**
 * Server-side compute for the dashboard's always-visible data: the summary
 * cards and the sidebar facets. Shared by /api/dashboard/core (which returns
 * both in one request) and the older /api/dashboard/summary and
 * /api/dashboard/facets routes. Each half keeps its own cache key so the
 * routes and the merged endpoint share cache entries.
 */

type FacetSpec = { key: keyof AvailableOptions; entity: AggregateEntity; column: string }

// Mirrors getAvailableOptions in lib/dashboard/filtering.ts.
export const FACETS: FacetSpec[] = [
  { key: "accountHqRegionValues", entity: "accounts", column: "account_hq_region" },
  { key: "accountHqCountryValues", entity: "accounts", column: "account_hq_country" },
  { key: "accountHqIndustryValues", entity: "accounts", column: "account_hq_industry" },
  { key: "accountDataCoverageValues", entity: "accounts", column: "account_data_coverage" },
  { key: "accountSourceValues", entity: "accounts", column: "account_source" },
  { key: "accountTypeValues", entity: "accounts", column: "account_type" },
  { key: "accountPrimaryCategoryValues", entity: "accounts", column: "account_primary_category" },
  { key: "accountPrimaryNatureValues", entity: "accounts", column: "account_primary_nature" },
  { key: "accountNasscomStatusValues", entity: "accounts", column: "account_nasscom_status" },
  { key: "accountHqEmployeeRangeValues", entity: "accounts", column: "account_hq_employee_range" },
  { key: "accountCenterEmployeesRangeValues", entity: "accounts", column: "account_center_employees_range" },
  { key: "centerTypeValues", entity: "centers", column: "center_type" },
  { key: "centerFocusValues", entity: "centers", column: "center_focus" },
  { key: "centerCityValues", entity: "centers", column: "center_city" },
  { key: "centerStateValues", entity: "centers", column: "center_state" },
  { key: "centerCountryValues", entity: "centers", column: "center_country" },
  { key: "centerEmployeesRangeValues", entity: "centers", column: "center_employees_range" },
  { key: "centerStatusValues", entity: "centers", column: "center_status" },
  { key: "functionNameValues", entity: "functions", column: "function_name" },
  { key: "prospectDepartmentValues", entity: "prospects", column: "prospect_department" },
  { key: "prospectHeadTypeValues", entity: "prospects", column: "head_type" },
  { key: "prospectLevelValues", entity: "prospects", column: "prospect_level" },
  { key: "prospectCityValues", entity: "prospects", column: "prospect_city" },
]

const sortOptions = (rows: FilterOption[]) =>
  rows.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))

/**
 * All 23 facet option lists. Facets are grouped by their effective filters
 * (facet-excludes-itself: an active facet does not constrain its own list),
 * and each group runs as ONE union-all statement over a single cascade, so
 * the common case (no active facets) is one warehouse query.
 */
async function facetOptions(filters: Filters, access: FilterAccess): Promise<AvailableOptions> {
  const groups = new Map<string, { filters: Filters; specs: { id: number; entity: AggregateEntity; column: string }[] }>()
  FACETS.forEach((spec, id) => {
    const active = ((filters[spec.key as keyof Filters] as FilterValue[] | undefined)?.length ?? 0) > 0
    const facetFilters = active ? ({ ...filters, [spec.key]: [] } as Filters) : filters
    const groupKey = active ? spec.key : ""
    const group = groups.get(groupKey) ?? { filters: facetFilters, specs: [] }
    group.specs.push({ id, entity: spec.entity, column: spec.column })
    groups.set(groupKey, group)
  })

  const lists: FilterOption[][] = FACETS.map(() => [])
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const rows = await queryWarehouse<{ facet: number; value: string | null; count: number }>(
        buildFacetCountsQuery(group.specs, group.filters, access)
      )
      for (const r of rows) {
        lists[Number(r.facet)]?.push({ value: String(r.value ?? ""), count: Number(r.count) })
      }
    })
  )
  return Object.fromEntries(FACETS.map((spec, id) => [spec.key, sortOptions(lists[id])])) as unknown as AvailableOptions
}

const RANGE_COLUMNS = [
  ["revenue", "accounts", "account_hq_revenue"],
  ["yearsInIndia", "accounts", "years_in_india"],
  ["centerIncYear", "centers", "center_inc_year"],
] as const

/** Base min/max for the three range sliders, one statement for all three. */
async function facetRanges(): Promise<FacetsResponse["ranges"]> {
  const text = RANGE_COLUMNS.map(
    ([key, table, column]) =>
      `select '${key}' as key, min(${column})::float8 as min, max(${column})::float8 as max from ${table} where ${column} is not null and ${column} > 0`
  ).join(" union all ")
  const rows = await queryWarehouse<{ key: string; min: number | null; max: number | null }>({ text, values: [] })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const pick = (key: string) => {
    const r = byKey.get(key)
    if (!r || r.min == null || r.max == null) return { min: 0, max: 1000000 }
    return { min: Number(r.min), max: Number(r.max) }
  }
  return { revenue: pick("revenue"), yearsInIndia: pick("yearsInIndia"), centerIncYear: pick("centerIncYear") }
}

export function computeFacets(filters: Filters, access: FilterAccess, opts: { bypassRead?: boolean } = {}): Promise<FacetsResponse> {
  return getOrCompute(
    `facets:${JSON.stringify(filters)}`,
    dashboardCacheTtlMs(),
    async () => {
      const [options, ranges] = await Promise.all([facetOptions(filters, access), facetRanges()])
      return { options, ranges }
    },
    opts
  )
}

// Centers count + upcoming + headcount in one pass. Headcount excludes the same
// center types as getDashboardSummaryMetrics (app/actions/data.ts).
const CENTER_METRICS =
  "count(*)::int as centers, " +
  "sum(case when center_status = 'Upcoming' then 1 else 0 end)::int as upcoming, " +
  "coalesce(sum(case when (center_type is null or lower(center_type) not in " +
  "('manufacturing', 'sales & marketing', 'bpo', 'distribution')) then center_employees else 0 end), 0)::int as headcount"

const num = (rows: Record<string, unknown>[], key: string) => Number(rows[0]?.[key] ?? 0)

export function computeSummary(filters: Filters, access: FilterAccess, opts: { bypassRead?: boolean } = {}): Promise<SummaryResponse> {
  return getOrCompute(
    `summary:${JSON.stringify(filters)}`,
    dashboardCacheTtlMs(),
    async () => {
      // Filtered services = services rows of the surviving centers (services
      // have no filter engine of their own). Used by the export-by-filter dialog.
      const centersSub = buildCentersQuery(filters, access, { columns: "cn_unique_key", orderBy: null })
      const servicesFilteredQuery: SqlQuery = {
        text: `select count(*)::int as total from services where cn_unique_key in (${centersSub.text})`,
        values: centersSub.values,
      }
      // The unfiltered totals do not depend on the filters; one statement.
      const fullQuery: SqlQuery = {
        text:
          "select (select count(*)::int from accounts) as accounts, (select count(*)::int from prospects) as prospects, " +
          `(select count(*)::int from services) as services, c.* from (select ${CENTER_METRICS} from centers) c`,
        values: [],
      }

      const [accF, cenF, proF, svcF, all] = await Promise.all([
        queryWarehouse(buildEntityAggregateQuery("accounts", filters, access, "count(*)::int as total")),
        queryWarehouse(buildEntityAggregateQuery("centers", filters, access, CENTER_METRICS)),
        queryWarehouse(buildEntityAggregateQuery("prospects", filters, access, "count(*)::int as total")),
        queryWarehouse(servicesFilteredQuery),
        queryWarehouse(fullQuery),
      ])

      return {
        filtered: {
          accounts: num(accF, "total"),
          centers: num(cenF, "centers"),
          upcomingCenters: num(cenF, "upcoming"),
          prospects: num(proF, "total"),
          headcount: num(cenF, "headcount"),
          services: num(svcF, "total"),
        },
        full: {
          accounts: num(all, "accounts"),
          centers: num(all, "centers"),
          upcomingCenters: num(all, "upcoming"),
          prospects: num(all, "prospects"),
          headcount: num(all, "headcount"),
          services: num(all, "services"),
        },
      }
    },
    opts
  )
}
