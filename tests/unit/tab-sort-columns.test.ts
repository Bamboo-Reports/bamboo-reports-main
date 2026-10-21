import { describe, expect, it } from "vitest"
import { TAB_SORT_COLUMNS } from "@/lib/dashboard/entity-columns"
import { resolveOrder, type QueryEntity } from "@/lib/dashboard/entity-query"

/**
 * resolveOrder silently falls back to the default order for a column outside
 * the server whitelist, so a stale tab mapping would make that tab's sort a
 * no-op with no error. Each mapped column must be honoured: sorting by it
 * descending leads the ORDER BY with that column.
 */
describe("TAB_SORT_COLUMNS", () => {
  const entries = (Object.keys(TAB_SORT_COLUMNS) as QueryEntity[]).flatMap((entity) =>
    Object.entries(TAB_SORT_COLUMNS[entity]).map(([key, column]) => ({ entity, key, column }))
  )

  it.each(entries)("$entity.$key sorts by $column on the server", ({ entity, column }) => {
    const order = resolveOrder(entity, { column, direction: "desc" })
    expect(order).not.toBe(resolveOrder(entity, undefined))
    expect(order.startsWith(`case when ${column} is null`) || order.startsWith(`${column} desc`)).toBe(true)
  })
})
