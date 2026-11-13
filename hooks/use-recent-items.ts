"use client"

import { useState, useCallback, useEffect } from "react"
import type { SearchResultType } from "@/lib/search"

export interface RecentItem {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  viewedAt: number
}

const STORAGE_KEY = "br-recent-items"
const RECENT_SEARCHES_KEY = "br-recent-searches"
const MAX_RECENT_SEARCHES = 5

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored) return JSON.parse(stored) as T
  } catch {
    // ignore parse errors
  }
  return fallback
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

export function useRecentItems() {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    setRecentItems(loadFromStorage<RecentItem[]>(STORAGE_KEY, []))
    setRecentSearches(loadFromStorage<string[]>(RECENT_SEARCHES_KEY, []))
  }, [])

  const addRecentItem = useCallback(
    (item: Omit<RecentItem, "viewedAt">) => {
      setRecentItems((prev) => {
        const filtered = prev.filter((r) => !(r.type === item.type && r.id === item.id))
        const next = [{ ...item, viewedAt: Date.now() }, ...filtered]
        saveToStorage(STORAGE_KEY, next)
        return next
      })
    },
    []
  )

  const addRecentSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
      const next = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES)
      saveToStorage(RECENT_SEARCHES_KEY, next)
      return next
    })
  }, [])

  const clearRecentItems = useCallback(() => {
    setRecentItems([])
    saveToStorage(STORAGE_KEY, [])
  }, [])

  /** Removes one record from History. */
  const removeRecentItem = useCallback((type: SearchResultType, id: string) => {
    setRecentItems((prev) => {
      const next = prev.filter((r) => !(r.type === type && r.id === id))
      saveToStorage(STORAGE_KEY, next)
      return next
    })
  }, [])

  /** Puts back a list removed by clearRecentItems or removeRecentItem (the History "Undo", #311). */
  // Puts removed records back without touching what is there now: an undo
  // must not drop records opened, or bring back ones removed, since it was offered.
  const restoreRecentItems = useCallback((items: RecentItem[]) => {
    setRecentItems((prev) => {
      const present = new Set(prev.map((r) => `${r.type}::${r.id}`))
      const missing = items.filter((r) => !present.has(`${r.type}::${r.id}`))
      if (missing.length === 0) return prev
      const next = [...prev, ...missing].sort((a, b) => b.viewedAt - a.viewedAt)
      saveToStorage(STORAGE_KEY, next)
      return next
    })
  }, [])

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([])
    saveToStorage(RECENT_SEARCHES_KEY, [])
  }, [])

  return {
    recentItems,
    recentSearches,
    addRecentItem,
    addRecentSearch,
    clearRecentItems,
    removeRecentItem,
    restoreRecentItems,
    clearRecentSearches,
  }
}
