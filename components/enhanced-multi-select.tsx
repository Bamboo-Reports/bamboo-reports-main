"use client"

import * as React from "react"
import { ChevronsUpDown, X, Plus, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
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
}

const DEFAULT_VISIBLE_OPTIONS = 20

// Memoized Badge component with include/exclude toggle
const EnhancedSelectBadge = React.memo(({
  item,
  onRemove,
  onToggleMode
}: {
  item: FilterValue
  onRemove: () => void
  onToggleMode: () => void
}) => {
  const isInclude = item.mode === 'include'

  return (
    <Badge
      variant="secondary"
      className={cn(
        "mr-1 mb-1 flex items-center gap-1 pr-1",
        isInclude
          ? "bg-green-500/20 text-green-700 dark:bg-green-500/30 dark:text-green-300 border-green-500/50 hover:bg-green-500/25"
          : "bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-300 border-red-500/50 hover:bg-red-500/25"
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleMode()
        }}
        className={cn(
          "flex items-center justify-center w-4 h-4 rounded-sm",
          isInclude
            ? "bg-green-600/30 hover:bg-green-600/40"
            : "bg-red-600/30 hover:bg-red-600/40"
        )}
        title={isInclude ? "Click to exclude" : "Click to include"}
        aria-label={isInclude ? `Exclude ${item.value}` : `Include ${item.value}`}
      >
        {isInclude ? (
          <Plus className="h-3 w-3" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
      </button>
      <span className="text-xs">{item.value}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove()
        }}
        className="ml-1"
        aria-label={`Remove ${item.value}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
})
EnhancedSelectBadge.displayName = "EnhancedSelectBadge"

// Memoized Command Item
const EnhancedSelectItem = React.memo(({
  value,
  disabled,
  isSelected,
  filterValue,
  onSelect,
  onSelectInclude,
  onSelectExclude
}: {
  value: string
  disabled: boolean
  isSelected: boolean
  filterValue?: FilterValue
  onSelect: () => void
  onSelectInclude: () => void
  onSelectExclude: () => void
}) => {
  const isInclude = filterValue?.mode === 'include'

  return (
    <CommandItem
      key={value}
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "cursor-pointer",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/30",
        isSelected && (isInclude
          ? "bg-green-500/10 hover:bg-green-500/15"
          : "bg-red-500/10 hover:bg-red-500/15")
      )}
    >
      <div className="flex items-center justify-between flex-1">
        <span className="flex-1">{value}</span>
        <div className="flex gap-1 ml-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-green-100/60 dark:hover:bg-green-900/15 transition-colors duration-150"
            onClick={(e) => {
              e.stopPropagation()
              onSelectInclude()
            }}
            title="Include"
            aria-label={`Include ${value}`}
          >
            <Plus className="h-3 w-3 text-green-600" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-red-100/60 dark:hover:bg-red-900/15 transition-colors duration-150"
            onClick={(e) => {
              e.stopPropagation()
              onSelectExclude()
            }}
            title="Exclude"
            aria-label={`Exclude ${value}`}
          >
            <Minus className="h-3 w-3 text-red-600" />
          </Button>
        </div>
      </div>
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
}: EnhancedMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
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
        // If already selected and no mode provided, toggle mode
        const currentMode = selected[existingIndex].mode
        const nextMode = currentMode === 'include' ? 'exclude' : 'include'
        const nextSelected: FilterValue[] = selected.map((i, idx) =>
          idx === existingIndex
            ? { ...i, mode: nextMode }
            : i
        )
        onChange(
          nextSelected
        )
        captureEvent(ANALYTICS_EVENTS.FILTER_OPTION_CLICKED, {
          filter_key: sourceFilterKey,
          option_value: value,
          mode: nextMode,
          action: "toggle_mode",
          selected_values: toTrackedFilterPlainValues(nextSelected),
          selected_values_with_mode: toTrackedFilterValueArray(nextSelected),
        })
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
  }, [options, selected, onChange, sourceFilterKey])

  const renderBadges = React.useMemo(() => {
    return selected.map((item) => (
      <EnhancedSelectBadge
        key={item.value}
        item={item}
        onRemove={() => handleUnselect(item)}
        onToggleMode={() => handleToggleMode(item)}
      />
    ))
  }, [selected, handleUnselect, handleToggleMode])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const visibleOptions = React.useMemo(() => {
    const allOptions = options.map((option) => ({
      value: typeof option === "string" ? option : option.value,
      count: typeof option === "object" ? (option.count ?? 0) : 0,
      disabled: typeof option === "object" ? (option.disabled ?? false) : false,
    }))

    if (normalizedSearchQuery.length > 0) {
      return allOptions.filter((option) => option.value.toLowerCase().includes(normalizedSearchQuery))
    }

    const sorted = [...allOptions].sort((a, b) => b.count - a.count)
    return sorted.slice(0, DEFAULT_VISIBLE_OPTIONS)
  }, [options, normalizedSearchQuery])

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
          disabled={disabled}
          isSelected={isSelected}
          filterValue={filterValue}
          onSelect={() => handleSelect(value)}
          onSelectInclude={() => handleSelect(value, 'include')}
          onSelectExclude={() => handleSelect(value, 'exclude')}
        />
      )
    })
  }, [visibleOptions, selected, handleSelect])

  // Count include vs exclude
  const includeCount = selected.filter(s => s.mode === 'include').length
  const excludeCount = selected.filter(s => s.mode === 'exclude').length

  // Handle isApplying changes to trigger success state
  const [showSuccess, setShowSuccess] = React.useState(false)
  const prevIsApplying = React.useRef(isApplying)

  React.useEffect(() => {
    if (prevIsApplying.current && !isApplying) {
      // Just finished applying
      setShowSuccess(true)
      const timer = setTimeout(() => {
        setShowSuccess(false)
      }, 500)
      return () => clearTimeout(timer)
    }
    prevIsApplying.current = isApplying
  }, [isApplying])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="justify-between h-auto min-h-10 bg-transparent hover:bg-accent/20 flex-1 transition-colors duration-150"
            >
              <div className="flex gap-1 flex-wrap items-center w-full">
                {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
                {selected.length > 0 && (
                  <div className="flex items-center gap-2 mr-2">
                    {includeCount > 0 && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        +{includeCount}
                      </span>
                    )}
                    {excludeCount > 0 && (
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        -{excludeCount}
                      </span>
                    )}
                  </div>
                )}
                {renderBadges}
              </div>
              <ChevronsUpDown className={cn(
                "h-4 w-4 shrink-0 opacity-50 ml-2",
                open && "rotate-180"
              )} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[200px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder={hasMoreOptions ? `Search all ${options.length} options...` : "Search..."}
                className="h-9"
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              {hasMoreOptions ? (
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-b">
                  Showing first {DEFAULT_VISIBLE_OPTIONS} options. Use search to find more.
                </p>
              ) : null}
              <CommandList className="max-h-64">
                <CommandEmpty>No item found.</CommandEmpty>
                <CommandGroup>
                  {renderOptions}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
})

EnhancedMultiSelect.displayName = "EnhancedMultiSelect"
