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
  /** Columns appended to every ORDER BY to make it total. See resolveOrder. */
  tiebreak: string[]
  rows: (f: Filters, a: FilterAccess, o: { columns: string; orderBy: string; limit: number; offset: number }) => SqlQuery
  count: (f: Filters, a: FilterAccess) => SqlQuery
}

const CONFIG: Record<QueryEntity, EntityConfig> = {
  accounts: {
    projection: ACCOUNT_PROJECTION,
    sortable: new Set([...ACCOUNT_COLUMNS, "account_hq_revenue"]),
    defaultOrder: "account_global_legal_name asc",
    tiebreak: ["account_global_legal_name"],
    rows: buildAccountsQuery,
    count: buildAccountsCountQuery,
  },
  centers: {
    projection: CENTER_COLUMNS.join(", "),
    sortable: new Set(CENTER_COLUMNS),
    defaultOrder: "center_name asc",
    tiebreak: ["cn_unique_key"],
    rows: buildCentersQuery,
    count: buildCentersCountQuery,
  },
  prospects: {
    projection: PROSPECT_COLUMNS.join(", "),
    sortable: new Set(PROSPECT_COLUMNS),
    defaultOrder: "ps_unique_key asc",
    // Prospects have no primary key: ps_unique_key is nullable and non-unique
    // (hence the keyless-prospect handling in lib/exports/server-builder.ts), so
    // the tiebreak falls back to the ETL's row identity (the prospects
    // secondary_id in etl/V2/main.py).
    tiebreak: [
      "ps_unique_key",
      "prospect_email",
      "prospect_full_name",
      "prospect_first_name",
      "prospect_last_name",
      "account_global_legal_name",
    ],
    rows: buildProspectsQuery,
    count: buildProspectsCountQuery,
  },
}

export type SortSpec = { column?: unknown; direction?: unknown }

/**
 * Resolves the ORDER BY for a page request, always ending in a tiebreak that
 * makes the ordering total.
 *
 * Pages are fetched one query per page, so an ordering with ties lets the
 * planner return tied rows in a different order per page: the same row can show
 * up on two pages while another is never returned at all. Every sortable column
 * here (and both non-key defaults) has ties, so the entity's tiebreak columns
 * are appended unless the chosen column already is the tiebreak.
 */
export function resolveOrder(entity: QueryEntity, sort: SortSpec | undefined): string {
  const cfg = CONFIG[entity]
  const base =
    !sort || typeof sort.column !== "string" || !cfg.sortable.has(sort.column)
      ? cfg.defaultOrder
      : // NULLS LAST keeps empty values at the end regardless of direction.
        `${sort.column} ${sort.direction === "desc" ? "desc" : "asc"} nulls last`

  const baseColumn = base.split(" ")[0]
  const extra = cfg.tiebreak.filter((column) => column !== baseColumn)
  if (extra.length === 0) return base
  return `${base}, ${extra.map((column) => `${column} asc`).join(", ")}`
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
  const orderBy = resolveOrder(entity, opts.sort)

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
