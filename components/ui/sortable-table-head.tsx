"use client"

import { RiArrowDownLine, RiArrowUpLine, RiExpandUpDownLine } from "@remixicon/react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface SortableTableHeadProps<T extends string = string> {
  label: string
  sortKey: T
  currentKey: T
  direction: "asc" | "desc" | null
  onSort: (key: T) => void
  className?: string
}

// A header cell whose label sorts the column. The cell owns the header type
// (size, case, tracking, muted colour); the button inherits it, and the sorted
// column steps up to foreground with a direction arrow. Sort state is exposed
// through aria-sort on the cell, which is what screen readers announce.
export function SortableTableHead<T extends string = string>({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  className,
}: SortableTableHeadProps<T>) {
  const isActive = currentKey === sortKey && direction !== null
  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={label}
        className={cn(
          "group/sort -mx-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-left [text-transform:inherit] interactive hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "text-foreground"
        )}
      >
        <span className="truncate">{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <RiArrowUpLine className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <RiArrowDownLine className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          )
        ) : (
          <RiExpandUpDownLine
            className="h-3.5 w-3.5 shrink-0 opacity-40 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  )
}
