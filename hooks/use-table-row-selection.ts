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
  /** Stable identity for a row (empty string means the row has no stable key). */
  getKey: (item: T) => string
}

/**
 * Selection store shared by the data-table tabs. The table reads `selected`
 * as its row selection state and writes changes back through `setSelected`.
 * Rows without a stable key (empty getKey) are not selectable.
 */
export function useTableRowSelection<T>({ entity, items, getKey }: UseTableRowSelectionParams<T>) {
  const availableKeys = useMemo(
    () => items.map(getKey).filter((key): key is string => Boolean(key)),
    [items, getKey]
  )
  const { selected, toggleMany, clear } = useRowSelection(availableKeys)

  // Only user-driven checkbox changes are tracked; pruning after a filter
  // change goes through useRowSelection directly and stays silent.
  const setSelected = useCallback(
    (keys: string[], checked: boolean, method: "row" | "all") => {
      if (keys.length === 0) return
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
      toggleMany(keys, checked)
    },
    [selected, entity, toggleMany]
  )

  return { selected, setSelected, clear }
}
