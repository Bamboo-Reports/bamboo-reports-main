"use client"

import React from "react"
import { RiArrowRightSLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

interface FilterRowProps {
  label: string
  /** Shown on the collapsed row when the filter is set; otherwise the row reads "Any". */
  summary?: React.ReactNode
  active: boolean
  children: React.ReactNode
}

/**
 * One filter as a single line (label, current value, chevron) that opens in
 * place to edit. Rows that are set open on first render.
 */
export function FilterRow({ label, summary, active, children }: FilterRowProps) {
  const [open, setOpen] = React.useState(active)
  const bodyId = React.useId()

  return (
    <div data-filter-row className={cn("rounded-lg", open && "my-0.5 bg-sidebar-accent")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "flex min-h-9 w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-[13px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !open && "hover:bg-muted/60"
        )}
      >
        <span className={cn("shrink-0 text-foreground", active && "font-medium")}>{label}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-right text-[13px]",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {active ? summary : "Any"}
        </span>
        <RiArrowRightSLine
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-3 px-2.5 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

/** Divider before the less-used filters (what used to sit behind "Show More"). */
export function FilterMoreDivider() {
  return (
    <div className="mx-2.5 mb-1 mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      More
      <span className="h-px flex-1 bg-sidebar-border" />
    </div>
  )
}
