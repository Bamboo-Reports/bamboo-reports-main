"use client"

import { useCallback, useMemo } from "react"
import { useRowSelection } from "@/hooks/use-row-selection"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

interface UseTableRowSelectionParams<T> {
  /** Entity name reported with selection analytics. */
  entity: "account" | "center" | "prospect"
  /** Full (filtered) dataset, used for the selectable key set and pruning. */
  items: T[]
  /** Entities on the current page, used for the header "select all" state. */
  pageItems: T[]
  /** Stable identity for a row (empty string means the row has no stable key). */
  getKey: (item: T) => string
}

/**
 * Shared selection wiring for the data-table tabs. Keeps the derived
 * "select all on page" state and stable per-row callbacks in one place so the
 * three tabs stay in sync. Rows without a stable key (empty getKey) are not
 * selectable.
 */
export function useTableRowSelection<T>({
  entity,
  items,
  pageItems,
  getKey,
}: UseTableRowSelectionParams<T>) {
  const availableKeys = useMemo(
    () => items.map(getKey).filter((key): key is string => Boolean(key)),
    [items, getKey]
  )
  const { selected, toggle, toggleMany: toggleManyKeys, clear } = useRowSelection(availableKeys)

  // Only user-driven checkbox changes are tracked; pruning after a filter
  // change goes through useRowSelection directly and stays silent.
  const trackSelection = useCallback(
    (keys: string[], checked: boolean, method: "row" | "all") => {
      const next = new Set(selected)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      captureEvent(ANALYTICS_EVENTS.ROWS_SELECTED, {
        entity,
        selected_count: next.size,
        method,
        action: checked ? "select" : "deselect",
      })
    },
    [selected, entity]
  )

  const toggleMany = useCallback(
    (keys: string[], checked: boolean) => {
      trackSelection(keys, checked, "all")
      toggleManyKeys(keys, checked)
    },
    [trackSelection, toggleManyKeys]
  )

  const pageKeys = useMemo(
    () => pageItems.map(getKey).filter((key): key is string => Boolean(key)),
    [pageItems, getKey]
  )
  const selectedOnPageCount = pageKeys.filter((key) => selected.has(key)).length
  const allPageSelected = pageKeys.length > 0 && selectedOnPageCount === pageKeys.length
  const somePageSelected = selectedOnPageCount > 0 && !allPageSelected

  const handleRowSelectChange = useCallback(
    (item: T, checked: boolean) => {
      const key = getKey(item)
      if (!key) return
      trackSelection([key], checked, "row")
      toggle(key, checked)
    },
    [toggle, getKey, trackSelection]
  )

  return {
    selected,
    toggleMany,
    clear,
    pageKeys,
    allPageSelected,
    somePageSelected,
    handleRowSelectChange,
  }
}
