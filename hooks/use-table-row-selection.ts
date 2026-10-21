"use client"

import { useCallback, useMemo } from "react"
import { useRowSelection } from "@/hooks/use-row-selection"

interface UseTableRowSelectionParams<T> {
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
  items,
  pageItems,
  getKey,
}: UseTableRowSelectionParams<T>) {
  const availableKeys = useMemo(
    () => items.map(getKey).filter((key): key is string => Boolean(key)),
    [items, getKey]
  )
  const { selected, toggle, toggleMany, clear } = useRowSelection(availableKeys)

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
      if (key) toggle(key, checked)
    },
    [toggle, getKey]
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
