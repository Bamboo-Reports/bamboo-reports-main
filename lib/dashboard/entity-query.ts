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
import { ACCOUNT_COLUMNS, CENTER_COLUMNS, PROSPECT_COLUMNS, ACCOUNT_PROJECTION } from "@/lib/dashboard/entity-columns"

export { ACCOUNT_COLUMNS, CENTER_COLUMNS, PROSPECT_COLUMNS }

export type QueryEntity = "accounts" | "centers" | "prospects"

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 51

type EntityConfig = {
  projection: string
  sortable: Set<string>
  defaultOrder: string
  rows: (f: Filters, a: FilterAccess, o: { columns: string; orderBy: string; limit: number; offset: number }) => SqlQuery
  count: (f: Filters, a: FilterAccess) => SqlQuery
}

const CONFIG: Record<QueryEntity, EntityConfig> = {
  accounts: {
    projection: ACCOUNT_PROJECTION,
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
