import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  type RowData,
} from "@tanstack/react-table"

// TanStack Table v9 only bundles the features registered here. The row models
// cover client-side mode; in server mode (#249) the tables switch to manual
// sorting and pagination and these are bypassed.
export const dataTableFeatures = tableFeatures({
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
})

export type DataTableFeatures = typeof dataTableFeatures

declare module "@tanstack/table-core" {
  interface ColumnMeta<TFeatures, TData extends RowData, TValue> {
    /** Width and truncation classes, applied to both the header and body cells. */
    className?: string
    /** Clicks inside this cell do not open the row (checkbox column). */
    stopRowClick?: boolean
  }
}
