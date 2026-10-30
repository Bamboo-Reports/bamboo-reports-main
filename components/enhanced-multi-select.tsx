"use client"

import * as React from "react"
import { RiAddLine, RiCloseLine, RiSubtractLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FilterChip } from "@/components/filters/filter-chip"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  normalizeTrackedText,
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
  toTrackedStringArray,
} from "@/lib/analytics/tracking"
import type { FilterValue } from "@/lib/types"

interface EnhancedMultiSelectProps {
  options: Array<{ value: string; count?: number; disabled?: boolean }>
  selected: FilterValue[]
  onChange: (selected: FilterValue[]) => void
  placeholder?: string
  trackingKey?: string
  className?: string
  isApplying?: boolean
  /** Bands like "<50", "51 - 100", "1K - 5K": list them smallest to largest instead of by count. */
  ordered?: boolean
}

const DEFAULT_VISIBLE_OPTIONS = 20
const MAX_SEARCH_RESULTS = 100

const UNIT: Record<string, number> = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9 }

/** Sort key for a band label: "<50" sorts before "51 - 100", ">10K" after "5K - 10K". */
export function bandSortKey(label: string) {
  const match = label.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(bn|mn|k|m|b)?/)
  if (!match) return Number.POSITIVE_INFINITY
  const amount = Number.parseFloat(match[1]) * (UNIT[match[2] ?? ""] ?? 1)
  const trimmed = label.trim()
  if (trimmed.startsWith("<")) return amount - 0.5
  if (trimmed.startsWith(">")) return amount + 0.5
  return amount
}

// One option in the list. No checkbox: a value is off, included or excluded,
// shown by the +/− mark and tint; the labelled buttons appear on hover.
const EnhancedSelectItem = React.memo(({
  value,
  count,
  disabled,
  filterValue,
  onSelect,
  onSelectInclude,
  onSelectExclude,
  onRemove,
}: {
  value: string
  count?: number
  disabled: boolean
  filterValue?: FilterValue
  onSelect: () => void
  onSelectInclude: () => void
  onSelectExclude: () => void
  onRemove: () => void
}) => {
  const mode = filterValue?.mode
  const action = (label: string, handler: () => void, className: string, children: React.ReactNode, ariaLabel?: string) => (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        handler()
      }}
      className={cn("inline-flex h-[22px] items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold", className)}
      title={label}
      aria-label={ariaLabel ?? `${label} ${value}`}
    >
      {children}
    </button>
  )

  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "group gap-2 rounded-md py-1 pl-2 pr-1 text-[12.5px]",
        mode === "include" && "bg-include/[0.08] data-[selected=true]:bg-include/[0.13]",
        mode === "exclude" && "bg-exclude/[0.07] data-[selected=true]:bg-exclude/[0.11]"
      )}
    >
      {mode && (
        <span className={cn("-mr-1 grid h-4 w-3.5 shrink-0 place-items-center", mode === "include" ? "text-include" : "text-exclude")} aria-hidden="true">
          {mode === "include" ? <RiAddLine className="h-3.5 w-3.5" /> : <RiSubtractLine className="h-3.5 w-3.5" />}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate", mode === "exclude" && "text-exclude")}>{value}</span>
      {typeof count === "number" && (
        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground group-hover:hidden group-data-[selected=true]:hidden">
          {count.toLocaleString()}
        </span>
      )}
      {!disabled && (
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-data-[selected=true]:flex">
          {mode !== "include" && action("Include", onSelectInclude, "bg-include/[0.12] text-include", <><RiAddLine className="h-3 w-3" />Include</>)}
          {mode !== "exclude" && action("Exclude", onSelectExclude, "bg-exclude/10 text-exclude", <><RiSubtractLine className="h-3 w-3" />Exclude</>)}
          {mode && action("Remove", onRemove, "w-[22px] justify-center bg-muted px-0 text-muted-foreground", <RiCloseLine className="h-3 w-3" />)}
        </span>
      )}
    </CommandItem>
  )
})
EnhancedSelectItem.displayName = "EnhancedSelectItem"

export const EnhancedMultiSelect = React.memo(function EnhancedMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  trackingKey,
  className,
  isApplying = false,
  ordered = false,
}: EnhancedMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const listId = React.useId()
  const searchTrackTimeoutRef = React.useRef<number | null>(null)
  const sourceFilterKey = trackingKey ?? placeholder

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("")
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const selectedValues = toTrackedFilterPlainValues(selected)
    const selectedValuesWithMode = toTrackedFilterValueArray(selected)
    const includeValues = toTrackedStringArray(
      selected.filter((item) => item.mode === "include").map((item) => item.value)
    )
    const excludeValues = toTrackedStringArray(
      selected.filter((item) => item.mode === "exclude").map((item) => item.value)
    )
    captureEvent(ANALYTICS_EVENTS.FILTER_DROPDOWN_OPENED, {
      filter_key: sourceFilterKey,
      selected_count: selected.length,
      options_count: options.length,
      selected_values: selectedValues,
      selected_values_with_mode: selectedValuesWithMode,
      include_values: includeValues,
      exclude_values: excludeValues,
      option_values_preview: toTrackedStringArray(options.map((option) => option.value)),
    })
  }, [open, sourceFilterKey, selected, options])

  const handleUnselect = React.useCallback((item: FilterValue) => {
    const nextSelected = selected.filter((i) => i.value !== item.value)
    onChange(nextSelected)
    captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
      filter_key: sourceFilterKey,
      option_value: item.value,
      mode: item.mode,
      action: "remove",
      selected_values: toTrackedFilterPlainValues(nextSelected),
      selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
    })
  }, [selected, onChange, sourceFilterKey])

  const handleToggleMode = React.useCallback((item: FilterValue) => {
    const nextSelected: FilterValue[] = selected.map((i) =>
      i.value === item.value
        ? { ...i, mode: i.mode === "include" ? "exclude" : "include" }
        : i
    )
    onChange(
      nextSelected
    )
    captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
      filter_key: sourceFilterKey,
      option_value: item.value,
      mode: item.mode === "include" ? "exclude" : "include",
      action: "toggle_mode_badge",
      selected_values: toTrackedFilterPlainValues(nextSelected),
      selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
    })
  }, [selected, onChange, sourceFilterKey])

  const handleSelect = React.useCallback((value: string, mode?: 'include' | 'exclude') => {
    const option = options.find((opt) => (typeof opt === "string" ? opt === value : opt.value === value))
    if (typeof option === "object" && option.disabled) return

    const existingIndex = selected.findIndex((i) => i.value === value)

    if (existingIndex >= 0) {
      if (mode) {
        // If mode is explicitly provided, set it
        const nextSelected: FilterValue[] = selected.map((i, idx) =>
          idx === existingIndex ? { ...i, mode } : i
        )
        onChange(
          nextSelected
        )
        captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
          filter_key: sourceFilterKey,
          option_value: value,
          mode,
          action: "update_mode",
          selected_values: toTrackedFilterPlainValues(nextSelected),
          selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
        })
      } else {
        // Clicking a selected value (no mode given) removes it.
        handleUnselect(selected[existingIndex])
      }
    } else {
      // Add with specified mode or default to include
      const nextMode = mode || 'include'
      const nextSelected: FilterValue[] = [...selected, { value, mode: nextMode }]
      onChange(nextSelected)
      captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
        filter_key: sourceFilterKey,
        option_value: value,
        mode: nextMode,
        action: "add",
        selected_values: toTrackedFilterPlainValues(nextSelected),
        selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
      })
    }
  }, [options, selected, onChange, sourceFilterKey, handleUnselect])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const deferredSearchQuery = React.useDeferredValue(normalizedSearchQuery)
  const visibleOptions = React.useMemo(() => {
    const allOptions = options.map((option) => ({
      value: typeof option === "string" ? option : option.value,
      count: typeof option === "object" ? (option.count ?? 0) : 0,
      disabled: typeof option === "object" ? (option.disabled ?? false) : false,
    }))

    if (deferredSearchQuery.length > 0) {
      const matched: typeof allOptions = []
      for (const option of allOptions) {
        if (option.value.toLowerCase().includes(deferredSearchQuery)) {
          matched.push(option)
          if (matched.length >= MAX_SEARCH_RESULTS) break
        }
      }
      return matched
    }

    if (ordered) {
      return [...allOptions].sort((a, b) => bandSortKey(a.value) - bandSortKey(b.value)).slice(0, DEFAULT_VISIBLE_OPTIONS)
    }
    const selectedValues = new Set(selected.map((item) => item.value))
    const sorted = [...allOptions].sort(
      (a, b) => Number(selectedValues.has(b.value)) - Number(selectedValues.has(a.value)) || b.count - a.count
    )
    return sorted.slice(0, Math.max(DEFAULT_VISIBLE_OPTIONS, selectedValues.size))
  }, [options, deferredSearchQuery, ordered, selected])

  const hasMoreOptions = normalizedSearchQuery.length === 0 && options.length > DEFAULT_VISIBLE_OPTIONS

  React.useEffect(() => {
    if (!open || normalizedSearchQuery.length === 0) {
      return
    }

    if (searchTrackTimeoutRef.current !== null) {
      window.clearTimeout(searchTrackTimeoutRef.current)
    }

    searchTrackTimeoutRef.current = window.setTimeout(() => {
      captureEvent(ANALYTICS_EVENTS.FILTER_SEARCH_TYPED, {
        filter_key: sourceFilterKey,
        query_text: normalizeTrackedText(normalizedSearchQuery),
        query_length: normalizedSearchQuery.length,
        results_visible_count: visibleOptions.length,
        has_more_options: hasMoreOptions,
        matching_option_values: toTrackedStringArray(visibleOptions.map((option) => option.value)),
      })
    }, 400)

    return () => {
      if (searchTrackTimeoutRef.current !== null) {
        window.clearTimeout(searchTrackTimeoutRef.current)
      }
    }
  }, [open, normalizedSearchQuery, visibleOptions, hasMoreOptions, sourceFilterKey])

  const renderOptions = React.useMemo(() => {
    return visibleOptions.map((option) => {
      const value = typeof option === "string" ? option : option.value
      const disabled = option.disabled
      const filterValue = selected.find((s) => s.value === value)
      const isSelected = !!filterValue

      return (
        <EnhancedSelectItem
          key={value}
          value={value}
          count={option.count}
          disabled={disabled && !isSelected}
          filterValue={filterValue}
          onSelect={() => handleSelect(value)}
          onSelectInclude={() => handleSelect(value, 'include')}
          onSelectExclude={() => handleSelect(value, 'exclude')}
          onRemove={() => filterValue && handleUnselect(filterValue)}
        />
      )
    })
  }, [visibleOptions, selected, handleSelect, handleUnselect])

  const prevIsApplying = React.useRef(isApplying)

  React.useEffect(() => {
    if (prevIsApplying.current && !isApplying) {
      prevIsApplying.current = isApplying
      return
    }
    prevIsApplying.current = isApplying
  }, [isApplying])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex flex-wrap items-center gap-1.5", className)}>
        {selected.map((item) => (
          <FilterChip
            key={item.value}
            item={item}
            onRemove={() => handleUnselect(item)}
            onToggleMode={() => handleToggleMode(item)}
          />
        ))}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-controls={listId}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="inline-flex h-[26px] items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 text-[12.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RiAddLine className="h-3.5 w-3.5" />
            {selected.length > 0 ? "Add" : placeholder}
          </button>
        </PopoverTrigger>
        {/* The picker hangs from the field's top edge, which never moves as chips are added
            and wrap, so it doesn't drift or flip while values are being picked. Rendered after
            the trigger so Radix registers it as the anchor last. */}
        <PopoverAnchor asChild>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px" />
        </PopoverAnchor>
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start" sideOffset={0}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={hasMoreOptions ? `Search all ${options.length.toLocaleString()} options` : "Search"}
            className="h-9"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList id={listId} className="max-h-64 p-1">
            <CommandEmpty>Nothing matches</CommandEmpty>
            <CommandGroup className="p-0">
              {renderOptions}
            </CommandGroup>
          </CommandList>
          {hasMoreOptions ? (
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              Showing the top {DEFAULT_VISIBLE_OPTIONS}. Search to find the rest.
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
})

EnhancedMultiSelect.displayName = "EnhancedMultiSelect"
