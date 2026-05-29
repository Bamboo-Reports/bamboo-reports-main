"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Tracks a set of selected row keys. Selection survives paging/sorting and is
 * pruned automatically when a key disappears from `availableKeys` (e.g. after a
 * filter change). Pass a memoized `availableKeys` array to avoid extra work.
 */
export function useRowSelection(availableKeys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const availableSet = useMemo(() => new Set(availableKeys), [availableKeys])

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((key) => availableSet.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [availableSet])

  const toggle = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const toggleMany = useCallback((keys: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, toggleMany, clear }
}
