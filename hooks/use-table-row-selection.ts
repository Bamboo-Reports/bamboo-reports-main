"use client"

import { useCallback, useMemo, useState } from "react"
import { useRowSelection } from "@/hooks/use-row-selection"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

interface UseTableRowSelectionParams<T> {
  /** Entity name reported with selection analytics. */
  entity: "account" | "center" | "prospect"
  /**
   * Full (filtered) dataset, used to prune selections that drop out of it.
   * Null in server mode, where only the current page is loaded.
   */
  items: T[] | null
  /** Stable identity for a row (empty string means the row has no stable key). */
  getKey: (item: T) => string
  /** The selection is cleared whenever this changes (server mode: the filters). */
  resetKey?: string
}

/**
 * Selection store shared by the data-table tabs. The table reads `selected`
 * as its row selection state and writes changes back through `setSelected`.
 * Rows without a stable key (empty getKey) are not selectable. Selections
 * carry across pages until `resetKey` changes or, in client mode, the row
 * leaves `items`.
 */
export function useTableRowSelection<T>({ entity, items, getKey, resetKey }: UseTableRowSelectionParams<T>) {
  const availableKeys = useMemo(
    () => (items ? items.map(getKey).filter((key): key is string => Boolean(key)) : null),
    [items, getKey]
  )
  const { selected, toggleMany, clear } = useRowSelection(availableKeys)

  // Reset during render rather than in an effect, so a stale selection never paints.
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey)
  if (appliedResetKey !== resetKey) {
    setAppliedResetKey(resetKey)
    clear()
  }

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
