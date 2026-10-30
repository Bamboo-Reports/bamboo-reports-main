"use client"

import { useMemo, useState } from "react"
import {
  functionalUpdate,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { dataTableFeatures, type DataTableFeatures } from "@/components/tables/data-table-features"
import type { TabServerProps } from "@/components/tabs/accounts-tab"
import { useTableColumnPreferences } from "@/hooks/use-table-column-preferences"
import { useTableRowSelection } from "@/hooks/use-table-row-selection"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { TableDatasetKey } from "@/lib/dashboard/table-column-preferences"

const ENTITY_BY_DATASET = {
  accounts: "account",
  centers: "center",
  prospects: "prospect",
} as const

interface UseDataTableParams<TData extends RowData> {
  dataset: TableDatasetKey
  /** Server mode: the current page. Client mode: every row. */
  data: TData[]
  /** Must be referentially stable (module scope or useMemo). */
  columns: ColumnDef<DataTableFeatures, TData>[]
  /** Stable identity for a row; an empty string makes the row unselectable. */
  getRowKey: (item: TData) => string
  server?: TabServerProps | null
  /** 1-based page, owned by the dashboard so it can drive the server query. */
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  /** Changing the page size also returns every tab to page 1 (owned by the dashboard). */
  setItemsPerPage: (size: number) => void
}

/**
 * Wires a dashboard tab's existing state (server sort callbacks, the lifted
 * page number, saved column preferences and the selection store) into a
 * TanStack table instance, so the tab only renders `table`.
 */
export function useDataTable<TData extends RowData>({
  dataset,
  data,
  columns,
  getRowKey,
  server,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
}: UseDataTableParams<TData>) {
  const entity = ENTITY_BY_DATASET[dataset]
  const manual = Boolean(server)

  const [sorting, setSorting] = useState<SortingState>([])
  const columnPreferences = useTableColumnPreferences(dataset)
  const { columns: columnOptions, visibleColumnSet, setColumnVisible } = columnPreferences
  const { selected, setSelected, clear } = useTableRowSelection({ entity, items: data, getKey: getRowKey })

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: currentPage - 1, pageSize: itemsPerPage }),
    [currentPage, itemsPerPage]
  )
  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(Array.from(selected, (key) => [key, true])),
    [selected]
  )
  const columnVisibility = useMemo<ColumnVisibilityState>(
    () =>
      Object.fromEntries(
        columnOptions.map((column) => [column.key, visibleColumnSet.has(column.key as never)])
      ),
    [columnOptions, visibleColumnSet]
  )

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting)
    const [sort] = next
    const previousKey = sorting[0]?.id
    const key = sort?.id ?? previousKey
    const direction = sort ? (sort.desc ? "desc" : "asc") : null
    setSorting(next)
    if (!key) return
    captureEvent(ANALYTICS_EVENTS.SORT_CHANGED, {
      entity,
      sort_key: key,
      sort_direction: direction ?? "none",
    })
    server?.onSortChange(key, direction)
    setCurrentPage(1)
  }

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = functionalUpdate(updater, pagination)
    if (next.pageSize !== pagination.pageSize) setItemsPerPage(next.pageSize)
    else setCurrentPage(next.pageIndex + 1)
  }

  const handleRowSelectionChange = (updater: Updater<RowSelectionState>) => {
    const next = functionalUpdate(updater, rowSelection)
    const added = Object.keys(next).filter((key) => next[key] && !rowSelection[key])
    const removed = Object.keys(rowSelection).filter((key) => !next[key])
    const method = added.length + removed.length > 1 ? "all" : "row"
    setSelected(added, true, method)
    setSelected(removed, false, method)
  }

  const handleColumnVisibilityChange = (updater: Updater<ColumnVisibilityState>) => {
    const next = functionalUpdate(updater, columnVisibility)
    for (const [key, visible] of Object.entries(next)) {
      if (columnVisibility[key] !== visible) setColumnVisible(key as never, visible)
    }
  }

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId: (item, index) => getRowKey(item) || `row-${index}`,
    enableRowSelection: (row) => Boolean(getRowKey(row.original)),
    enableMultiSort: false,
    sortDescFirst: false,
    manualSorting: manual,
    manualPagination: manual,
    rowCount: server?.total,
    autoResetPageIndex: false,
    state: { sorting, pagination, rowSelection, columnVisibility },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: handleRowSelectionChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
  })

  return {
    table,
    /** Total rows across all pages (server total, or the client dataset). */
    totalRows: server ? server.total : data.length,
    selectedKeys: selected,
    clearSelection: clear,
    columnPreferences,
  }
}
