import type { Filters } from "@/lib/types"
import {
  buildAccountsQuery,
  buildAccountsCountQuery,
  buildCentersQuery,
  buildCentersCountQuery,
  buildProspectsQuery,
  buildProspectsCountQuery,
  type FilterAccess,
  type SqlQuery,
} from "@/lib/dashboard/filtering-sql"
import { queryWarehouse } from "@/lib/db/warehouse"

export type QueryEntity = "accounts" | "centers" | "prospects"

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 51

// Column projections mirror the dashboard fetchers in app/actions/data.ts so the
// paginated rows have the same shape the client already renders. account_hq_revenue
// is a bigint; cast to float8 so it deserializes as a number (as normalizeAccount did).
export const ACCOUNT_COLUMNS = [
  "account_nasscom_status", "account_nasscom_member_status", "account_data_coverage", "account_source",
  "account_type", "account_global_legal_name", "account_hq_stock_ticker", "account_hq_company_type",
  "account_about", "account_hq_key_offerings", "account_hq_city", "account_hq_state", "account_hq_country",
  "account_hq_region", "account_hq_sub_industry", "account_hq_industry", "account_hq_linkedin_link",
  "account_primary_category", "account_primary_nature", "account_hq_revenue_range", "account_hq_employee_count",
  "account_hq_employee_range", "account_hq_forbes_2000_rank", "account_hq_fortune_500_rank",
  "account_first_center_year", "years_in_india", "account_hq_website", "account_center_employees",
  "account_center_employees_range", "account_visibility", "account_visibility_note",
]
export const CENTER_COLUMNS = [
  "account_global_legal_name", "cn_unique_key", "center_status", "center_inc_year", "announced_year",
  "announced_month", "center_end_year", "center_name", "center_management_partner", "center_jv_status",
  "center_jv_name", "center_type", "center_focus", "center_website", "center_linkedin", "center_city",
  "center_state", "center_country", "center_country_iso2", "center_employees", "center_employees_range",
  "center_boardline", "center_account_website", "center_timeline", "center_address", "center_zip_code",
  "lat", "lng",
]
export const PROSPECT_COLUMNS = [
  "ps_unique_key", "account_global_legal_name", "prospect_full_name", "prospect_first_name",
  "prospect_last_name", "prospect_title", "prospect_department", "prospect_level", "head_type",
  "prospect_linkedin_url", "prospect_email", "prospect_city", "prospect_state", "prospect_country",
  "prospect_in_company_year", "prospect_current_year", "center_name",
]

type EntityConfig = {
  projection: string
  sortable: Set<string>
  defaultOrder: string
  rows: (f: Filters, a: FilterAccess, o: { columns: string; orderBy: string; limit: number; offset: number }) => SqlQuery
  count: (f: Filters, a: FilterAccess) => SqlQuery
}

const CONFIG: Record<QueryEntity, EntityConfig> = {
  accounts: {
    projection: [...ACCOUNT_COLUMNS.filter((c) => c !== "account_hq_revenue"), "account_hq_revenue::float8 as account_hq_revenue"].join(", "),
    sortable: new Set([...ACCOUNT_COLUMNS, "account_hq_revenue"]),
    defaultOrder: "account_global_legal_name asc",
    rows: buildAccountsQuery,
    count: buildAccountsCountQuery,
  },
  centers: {
    projection: CENTER_COLUMNS.join(", "),
    sortable: new Set(CENTER_COLUMNS),
    defaultOrder: "center_name asc",
    rows: buildCentersQuery,
    count: buildCentersCountQuery,
  },
  prospects: {
    projection: PROSPECT_COLUMNS.join(", "),
    sortable: new Set(PROSPECT_COLUMNS),
    defaultOrder: "ps_unique_key asc",
    rows: buildProspectsQuery,
    count: buildProspectsCountQuery,
  },
}

export type SortSpec = { column?: unknown; direction?: unknown }

function resolveOrder(cfg: EntityConfig, sort: SortSpec | undefined): string {
  if (!sort || typeof sort.column !== "string" || !cfg.sortable.has(sort.column)) {
    return cfg.defaultOrder
  }
  const dir = sort.direction === "desc" ? "desc" : "asc"
  // NULLS LAST keeps empty values at the end regardless of direction.
  return `${sort.column} ${dir} nulls last`
}

export function clampPage(page: unknown): number {
  const n = Number(page)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export function clampPageSize(pageSize: unknown): number {
  const n = Number(pageSize)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.floor(n))
}

export type EntityQueryResult = { rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }

export async function queryEntity(
  entity: QueryEntity,
  filters: Filters,
  access: FilterAccess,
  opts: { page?: unknown; pageSize?: unknown; sort?: SortSpec } = {}
): Promise<EntityQueryResult> {
  const cfg = CONFIG[entity]
  const page = clampPage(opts.page)
  const pageSize = clampPageSize(opts.pageSize)
  const orderBy = resolveOrder(cfg, opts.sort)

  const rowsQuery = cfg.rows(filters, access, {
    columns: cfg.projection,
    orderBy,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const countQuery = cfg.count(filters, access)

  const [rows, countRows] = await Promise.all([
    queryWarehouse(rowsQuery),
    queryWarehouse<{ total: number }>(countQuery),
  ])

  return { rows, total: Number(countRows[0]?.total ?? 0), page, pageSize }
}
