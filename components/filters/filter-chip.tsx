"use client"

import React from "react"
import { RiAddLine, RiCloseLine, RiSubtractLine } from "@remixicon/react"
import { HintTooltip, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TruncatedText } from "@/components/ui/truncated-text"
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
const CHIP_BUTTON =
  "grid h-5 w-5 shrink-0 place-items-center rounded transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/[0.08] active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Removing a chip unmounts the focused button, so focus moves on to the chip
 * that took its place, the one before it, or else the field's own input or
 * Add button (marked data-chip-add inside a data-chip-field container).
 */
function moveFocusAfterRemove(chip: HTMLElement | null) {
  const group = chip?.parentElement
  if (!chip || !group) return
  const before = Array.from(group.querySelectorAll<HTMLElement>("[data-chip-remove]"))
  const index = before.findIndex((button) => chip.contains(button))
  const field = group.closest<HTMLElement>("[data-chip-field]")
  requestAnimationFrame(() => {
    const after = Array.from(group.querySelectorAll<HTMLElement>("[data-chip-remove]"))
    const target = after[index] ?? after[index - 1] ?? field?.querySelector<HTMLElement>("[data-chip-add]")
    target?.focus()
  })
}

export function FilterChip({ item, onToggleMode, onRemove, className }: FilterChipProps) {
  const isInclude = item.mode === "include"
  const chipRef = React.useRef<HTMLSpanElement>(null)
  return (
    <span
      ref={chipRef}
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full items-center gap-0.5 rounded-md border px-0.5 text-xs font-medium",
        isInclude ? "border-include/35 bg-include/[0.08]" : "border-exclude/35 bg-exclude/[0.07]",
        className
      )}
    >
      <HintTooltip label={isInclude ? `Exclude ${item.value}` : `Include ${item.value}`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleMode()
          }}
          className={cn(CHIP_BUTTON, isInclude ? "text-include" : "text-exclude")}
        >
          {isInclude ? <RiAddLine className="h-3.5 w-3.5" /> : <RiSubtractLine className="h-3.5 w-3.5" />}
        </button>
      </HintTooltip>
      <TruncatedText text={item.value} className={cn("min-w-0 px-0.5", !isInclude && "text-exclude")} />
      <HintTooltip label={`Remove ${item.value}`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const hadFocus = document.activeElement === event.currentTarget
            onRemove()
            if (hadFocus) moveFocusAfterRemove(chipRef.current)
          }}
          data-chip-remove=""
          className={cn(CHIP_BUTTON, "text-muted-foreground hover:text-foreground")}
        >
          <RiCloseLine className="h-3.5 w-3.5" />
        </button>
      </HintTooltip>
    </span>
  )
}

/**
 * A collapsed filter row's summary: how many values are set. Hovering lists them.
 * It sits inside the row's toggle button, so it cannot take focus; opening the row shows the values as chips.
 */
export function FilterValuesSummary({ values }: { values: FilterValue[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="tabular-nums">{values.length}</span>
      </TooltipTrigger>
      <TooltipContent aria-label="">
        {values.map((item) => (item.mode === "exclude" ? `not ${item.value}` : item.value)).join(", ")}
      </TooltipContent>
    </Tooltip>
  )
}

/** A value as a read-only chip, marked + (included) or − (excluded) like FilterChip. */
export function FilterValueTag({ item }: { item: FilterValue }) {
  const isInclude = item.mode === "include"
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full items-center gap-0.5 rounded-md border pl-1 pr-2 text-xs font-medium",
        isInclude ? "border-include/35 bg-include/[0.08]" : "border-exclude/35 bg-exclude/[0.07] text-exclude"
      )}
    >
      {isInclude ? (
        <RiAddLine className="h-3.5 w-3.5 shrink-0 text-include" aria-label="including" />
      ) : (
        <RiSubtractLine className="h-3.5 w-3.5 shrink-0" aria-label="excluding" />
      )}
      <TruncatedText text={item.value} />
    </span>
  )
}
