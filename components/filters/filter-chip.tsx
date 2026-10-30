"use client"

import { RiAddLine, RiCloseLine, RiSubtractLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import type { FilterValue } from "@/lib/types"

interface FilterChipProps {
  item: FilterValue
  onToggleMode: () => void
  onRemove: () => void
  className?: string
}

/**
 * A selected filter value. The leading icon shows and switches the mode
 * (+ include, − exclude); excluded values are also tinted red, so the mode
 * never relies on colour alone.
 */
export function FilterChip({ item, onToggleMode, onRemove, className }: FilterChipProps) {
  const isInclude = item.mode === "include"
  return (
    <span
      className={cn(
        "inline-flex h-[26px] min-w-0 max-w-full items-center gap-0.5 rounded-md border px-[3px] text-[12.5px] font-medium",
        isInclude ? "border-include/35 bg-include/[0.08]" : "border-exclude/35 bg-exclude/[0.07]",
        className
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleMode()
        }}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-foreground/[0.08]",
          isInclude ? "text-include" : "text-exclude"
        )}
        title={isInclude ? "Switch to exclude" : "Switch to include"}
        aria-label={isInclude ? `Exclude ${item.value}` : `Include ${item.value}`}
      >
        {isInclude ? <RiAddLine className="h-3.5 w-3.5" /> : <RiSubtractLine className="h-3.5 w-3.5" />}
      </button>
      <span className={cn("min-w-0 truncate px-0.5", !isInclude && "text-exclude")} title={item.value}>
        {item.value}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onRemove()
        }}
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
        title="Remove"
        aria-label={`Remove ${item.value}`}
      >
        <RiCloseLine className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** A collapsed filter row's summary: how many values are set. Hovering lists them. */
export function FilterValuesSummary({ values }: { values: FilterValue[] }) {
  return (
    <span className="tabular-nums" title={values.map((item) => (item.mode === "exclude" ? `not ${item.value}` : item.value)).join(", ")}>
      {values.length}
    </span>
  )
}
