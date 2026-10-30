// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { createColumnHelper } from "@tanstack/react-table"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import { createSelectColumn } from "@/components/tables/data-table"
import { useDataTable } from "@/components/tables/use-data-table"

const captured = vi.hoisted(() => ({ events: [] as Array<{ event: string; props: Record<string, unknown> }> }))
vi.mock("@/lib/analytics/client", () => ({
  captureEvent: (event: string, props: Record<string, unknown>) => captured.events.push({ event, props }),
}))

type Row = { id: string; name: string }
const rows: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "", name: "No key" },
]
const columnHelper = createColumnHelper<DataTableFeatures, Row>()
const columns = columnHelper.columns([
  createSelectColumn<Row>((row) => row.name),
  columnHelper.accessor((row) => row.name, { id: "name", header: "Name", sortFn: "text" }),
])
const getRowKey = (row: Row) => row.id

function setup() {
  const server = { total: 120, onSortChange: vi.fn() }
  const setCurrentPage = vi.fn()
  const setItemsPerPage = vi.fn()
  const hook = renderHook(() =>
    useDataTable({
      dataset: "accounts",
      data: rows,
      columns,
      getRowKey,
      server,
      currentPage: 2,
      setCurrentPage,
      itemsPerPage: 25,
      setItemsPerPage,
    })
  )
  return { hook, server, setCurrentPage, setItemsPerPage }
}

describe("useDataTable", () => {
  beforeEach(() => {
    captured.events.length = 0
  })
  afterEach(cleanup)

  it("maps the dashboard's 1-based page onto server-side pagination", () => {
    const { hook } = setup()
    const { table } = hook.result.current
    expect(table.state.pagination).toEqual({ pageIndex: 1, pageSize: 25 })
    expect(table.getPageCount()).toBe(5)
    expect(table.getRowModel().rows).toHaveLength(3)
  })

  it("sends sort changes to the server, tracks them and returns to page 1", () => {
    const { hook, server, setCurrentPage } = setup()
    act(() => hook.result.current.table.getColumn("name")!.toggleSorting(false))
    expect(server.onSortChange).toHaveBeenLastCalledWith("name", "asc")
    expect(setCurrentPage).toHaveBeenLastCalledWith(1)
    expect(captured.events.at(-1)).toEqual({
      event: "sort_changed",
      props: { entity: "account", sort_key: "name", sort_direction: "asc" },
    })

    act(() => hook.result.current.table.getColumn("name")!.clearSorting())
    expect(server.onSortChange).toHaveBeenLastCalledWith("name", null)
    expect(captured.events.at(-1)?.props.sort_direction).toBe("none")
  })

  it("routes page and page-size changes to the right setter", () => {
    const { hook, setCurrentPage, setItemsPerPage } = setup()
    act(() => hook.result.current.table.nextPage())
    expect(setCurrentPage).toHaveBeenLastCalledWith(3)
    act(() => hook.result.current.table.setPageSize(50))
    expect(setItemsPerPage).toHaveBeenLastCalledWith(50)
  })

  it("selects keyed rows only and tracks row versus select-all changes", () => {
    const { hook } = setup()
    act(() => hook.result.current.table.getRow("a").toggleSelected(true))
    expect([...hook.result.current.selectedKeys]).toEqual(["a"])
    expect(captured.events.at(-1)?.props).toMatchObject({ entity: "account", method: "row", selected_count: 1 })

    act(() => hook.result.current.table.toggleAllPageRowsSelected(true))
    expect([...hook.result.current.selectedKeys].sort()).toEqual(["a", "b"])
    expect(hook.result.current.table.getIsAllPageRowsSelected()).toBe(true)

    act(() => hook.result.current.table.toggleAllPageRowsSelected(false))
    expect(hook.result.current.selectedKeys.size).toBe(0)
    expect(captured.events.at(-1)?.props).toMatchObject({ method: "all", action: "deselect", selected_count: 0 })
  })
})
