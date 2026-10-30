"use client"

import type { Column, RowData } from "@tanstack/react-table"
import { RiArrowDownLine, RiArrowUpLine, RiExpandUpDownLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DataTableFeatures } from "@/components/tables/data-table-features"

interface DataTableColumnHeaderProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>
  title: string
  className?: string
}

/** Sortable header: clicking cycles ascending, descending, then unsorted. */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn("truncate text-xs uppercase tracking-wider", className)}>{title}</div>
  }

  const sorted = column.getIsSorted()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-3 max-w-full text-xs uppercase tracking-wider", sorted ? "text-foreground" : "text-muted-foreground", className)}
      onClick={column.getToggleSortingHandler()}
      aria-label={
        sorted === "asc" ? `${title}, sorted ascending` : sorted === "desc" ? `${title}, sorted descending` : `Sort by ${title}`
      }
    >
      <span className="truncate">{title}</span>
      {sorted === "asc" ? (
        <RiArrowUpLine />
      ) : sorted === "desc" ? (
        <RiArrowDownLine />
      ) : (
        <RiExpandUpDownLine className="opacity-60" />
      )}
    </Button>
  )
}
