"use client"

import { useCallback, useMemo } from "react"
import { useRowSelection } from "@/hooks/use-row-selection"
import type { FavoriteEntityType, FavoriteInput } from "@/hooks/use-favorites"

interface UseTableRowSelectionParams<T> {
  /** Full (filtered) dataset, used for the selectable key set and pruning. */
  items: T[]
  /** Entities on the current page, used for the header "select all" state. */
  pageItems: T[]
  /** Stable identity for a row (empty string means the row has no stable key). */
  getKey: (item: T) => string
  /** Favorite key prefix, e.g. "account" -> favoriteKeys holds "account:<id>". */
  favoritePrefix: FavoriteEntityType
  favoriteKeys?: Set<string>
  /** Stable builder turning an entity into a favorite payload. */
  buildFavorite: (item: T) => FavoriteInput
  onToggleFavorite?: (item: FavoriteInput) => void
}

/**
 * Shared selection + favorite wiring for the data-table tabs. Keeps the
 * derived "select all on page" state, the bulk-favorite helpers, and stable
 * per-row callbacks in one place so the three tabs stay in sync. Rows without
 * a stable key (empty getKey) are not selectable or favoritable.
 */
export function useTableRowSelection<T>({
  items,
  pageItems,
  getKey,
  favoritePrefix,
  favoriteKeys,
  buildFavorite,
  onToggleFavorite,
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

  const allSelectedFavorited =
    selected.size > 0 &&
    Array.from(selected).every((key) => Boolean(favoriteKeys?.has(`${favoritePrefix}:${key}`)))

  /** Favorite payloads for the current selection (for bulk favorite/unfavorite). */
  const selectedFavoriteInputs = useCallback(
    () => items.filter((item) => selected.has(getKey(item))).map(buildFavorite),
    [items, selected, getKey, buildFavorite]
  )

  const handleRowSelectChange = useCallback(
    (item: T, checked: boolean) => {
      const key = getKey(item)
      if (key) toggle(key, checked)
    },
    [toggle, getKey]
  )
  const handleRowToggleFavorite = useCallback(
    (item: T) => {
      if (getKey(item) && onToggleFavorite) onToggleFavorite(buildFavorite(item))
    },
    [getKey, onToggleFavorite, buildFavorite]
  )

  return {
    selected,
    toggleMany,
    clear,
    pageKeys,
    allPageSelected,
    somePageSelected,
    allSelectedFavorited,
    selectedFavoriteInputs,
    handleRowSelectChange,
    handleRowToggleFavorite,
  }
}
