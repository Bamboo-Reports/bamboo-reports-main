"use client"

import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { TableColumnDefinition } from "@/lib/dashboard/table-column-preferences"

interface TableColumnMenuProps<ColumnKey extends string> {
  columns: readonly TableColumnDefinition<ColumnKey>[]
  visibleColumnSet: Set<ColumnKey>
  onToggleColumn: (column: ColumnKey, visible: boolean) => void
  onReset: () => void
}

export function TableColumnMenu<ColumnKey extends string>({
  columns,
  visibleColumnSet,
  onToggleColumn,
  onReset,
}: TableColumnMenuProps<ColumnKey>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-10 rounded-xl px-0"
          aria-label="Customize table columns"
          title="Customize table columns"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} alignOffset={-32} className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Table columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visibleColumnSet.has(column.key)}
            disabled={column.required}
            onCheckedChange={(checked) => onToggleColumn(column.key, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="truncate">{column.label}</span>
            {column.required ? (
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                Required
              </span>
            ) : null}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onReset}>
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
