"use client"

import { Fragment, type ReactNode, type Ref } from "react"
import { createColumnHelper, type Column, type ReactTable, type RowData } from "@tanstack/react-table"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiExpandUpDownLine,
  RiSortAlphabetAsc,
  RiSortAlphabetDesc,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { TableSkeletonRows, type TableLeadColumn } from "@/components/ui/data-skeletons"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DataTableFeatures } from "@/components/tables/data-table-features"
import { cn } from "@/lib/utils"

type DashboardTable<TData extends RowData> = ReactTable<DataTableFeatures, TData>

/** Single-line cell text with a tooltip for the full value. */
export function TruncatedText({ value }: { value: string | null | undefined }) {
  return (
    <div className="truncate" title={value || "N/A"}>
      {value || "N/A"}
    </div>
  )
}

/** Leading checkbox column; the header toggles every selectable row on the page. */
export function createSelectColumn<TData extends RowData>(getLabel: (item: TData) => string) {
  return createColumnHelper<DataTableFeatures, TData>().display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
        aria-label="Select all rows on this page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(value) => row.toggleSelected(value === true)}
        aria-label={`Select ${getLabel(row.original)}`}
      />
    ),
    enableSorting: false,
    meta: { className: "w-[44px]", stopRowClick: true },
  })
}

interface DataTableProps<TData extends RowData> {
  table: DashboardTable<TData>
  loading?: boolean
  skeletonLead?: TableLeadColumn
  onRowOpen: (item: TData) => void
  /** Accessible name for a row, e.g. "View account details for Acme". */
  getRowLabel: (item: TData) => string
  /** Right-click menu items for a row. */
  renderRowMenu?: (item: TData) => ReactNode
  scrollRef?: Ref<HTMLDivElement>
}

export function DataTable<TData extends RowData>({
  table,
  loading = false,
  skeletonLead,
  onRowOpen,
  getRowLabel,
  renderRowMenu,
  scrollRef,
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
      <div ref={scrollRef} className="h-full overflow-auto">
        <Table className="table-fixed">
          {/* Sticky, so it needs an opaque fill: the card colour keeps it part of the surface. */}
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))] [&_tr]:border-b-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn("h-11", header.column.columnDef.meta?.className)}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows lead={skeletonLead} columns={table.getAllLeafColumns().length} />
            ) : rows.length ? (
              rows.map((row) => {
                const item = row.original
                const tableRow = (
                  <TableRow
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="cursor-pointer focus-visible:bg-muted/70 focus-visible:outline-none"
                    onClick={() => onRowOpen(item)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onRowOpen(item)
                      }
                    }}
                    tabIndex={0}
                    aria-label={getRowLabel(item)}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <TableCell
                          key={cell.id}
                          className={meta?.className}
                          onClick={meta?.stopRowClick ? (event) => event.stopPropagation() : undefined}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )

                if (!renderRowMenu) {
                  return <Fragment key={row.id}>{tableRow}</Fragment>
                }
                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                    <ContextMenuContent className="w-48">{renderRowMenu(item)}</ContextMenuContent>
                  </ContextMenu>
                )
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getAllLeafColumns().length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Page sizes offered below the tables. The query API caps a page at 100 rows. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 50

/**
 * Page numbers to show (1-based): three pages starting at the current one,
 * e.g. 1 2 3 on page 1 and 3 4 5 on page 3. Near the end the run stops at
 * the last page (248 249 250).
 */
export function getPageItems(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current, total - 2))
  const end = Math.min(total, start + 2)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

interface DataTablePaginationProps<TData extends RowData> {
  table: DashboardTable<TData>
  totalRows: number
}

export function DataTablePagination<TData extends RowData>({ table, totalRows }: DataTablePaginationProps<TData>) {
  if (totalRows === 0) return null

  const { pageIndex, pageSize } = table.state.pagination
  const pageCount = Math.max(1, table.getPageCount())
  const currentPage = pageIndex + 1
  const firstRow = pageIndex * pageSize + 1
  const lastRow = Math.min(currentPage * pageSize, totalRows)

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
          <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            <SelectGroup>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {firstRow.toLocaleString()}-{lastRow.toLocaleString()} of {totalRows.toLocaleString()}
        </p>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <RiArrowLeftSLine />
          </Button>
          {getPageItems(currentPage, pageCount).map((page) => (
            <Button
              key={page}
              variant={page === currentPage ? "outline" : "ghost"}
              size="sm"
              className={cn("min-w-8 px-2 tabular-nums", page !== currentPage && "text-muted-foreground")}
              onClick={() => table.setPageIndex(page - 1)}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page.toLocaleString()}
            </Button>
          ))}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <RiArrowRightSLine />
          </Button>
        </nav>
      </div>
    </div>
  )
}

interface DataGridSortBarProps<TData extends RowData, TValue> {
  /** The table's name column; the grid layout sorts by it. */
  column: Column<DataTableFeatures, TData, TValue> | undefined
  label: string
}

/** Sort control for the grid layout, sharing the table's sort state. */
export function DataGridSortBar<TData extends RowData, TValue>({ column, label }: DataGridSortBarProps<TData, TValue>) {
  const sorted = column?.getIsSorted() ?? false
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">Sort</span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={column?.getToggleSortingHandler()}
        aria-label={`Sort by ${label}`}
        aria-pressed={sorted !== false}
      >
        {sorted === false ? (
          <RiExpandUpDownLine className="text-muted-foreground" />
        ) : sorted === "asc" ? (
          <RiSortAlphabetAsc className="text-primary" />
        ) : (
          <RiSortAlphabetDesc className="text-primary" />
        )}
      </Button>
    </div>
  )
}
