"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { devError } from "@/lib/utils/dev-log"
import { fetchSearch } from "@/lib/dashboard/api-client"
import type { Account, Alias, Center, Prospect } from "@/lib/types"
import { buildSearchIndex, searchIndex, type GroupedResults, type SearchResult } from "@/lib/search"

interface UseGlobalSearchProps {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  aliases?: Alias[]
  /** Server mode (#249): query /api/search instead of the in-browser index. */
  serverMode?: boolean
}

const EMPTY_RESULTS = {
  accounts: { items: [], totalMatches: 0 } as GroupedResults,
  centers: { items: [], totalMatches: 0 } as GroupedResults,
  prospects: { items: [], totalMatches: 0 } as GroupedResults,
  total: 0,
}

interface UseGlobalSearchReturn {
  query: string
  setQuery: (query: string) => void
  results: {
    accounts: GroupedResults
    centers: GroupedResults
    prospects: GroupedResults
    total: number
  }
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  handleOpen: () => void
  handleClose: () => void
}

const DEBOUNCE_MS = 300

export function useGlobalSearch({
  accounts,
  centers,
  prospects,
  aliases,
  serverMode = false,
}: UseGlobalSearchProps): UseGlobalSearchReturn {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [serverResults, setServerResults] = useState(EMPTY_RESULTS)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverRequestRef = useRef(0)

  const index = useMemo(
    () => (serverMode ? buildSearchIndex([], [], [], []) : buildSearchIndex(accounts, centers, prospects, aliases ?? [])),
    [serverMode, accounts, centers, prospects, aliases]
  )

  // Server mode: fetch grouped results for the debounced query.
  useEffect(() => {
    if (!serverMode) return
    const term = debouncedQuery.trim()
    const requestId = ++serverRequestRef.current
    if (term.length < 2) {
      setServerResults(EMPTY_RESULTS)
      return
    }
    fetchSearch(term)
      .then((res) => {
        if (serverRequestRef.current !== requestId) return
        const group = (g: { items: Array<{ type: string; id: string; title: string; subtitle: string; data?: unknown }>; totalMatches: number }): GroupedResults => ({
          items: g.items.map(
            (item) =>
              ({
                type: item.type,
                id: item.id,
                title: item.title,
                subtitle: item.subtitle,
                meta: "",
                data: item.data,
              }) as SearchResult
          ),
          totalMatches: g.totalMatches,
        })
        setServerResults({
          accounts: group(res.accounts),
          centers: group(res.centers),
          prospects: group(res.prospects),
          total: res.total,
        })
      })
      .catch((err) => {
        if (serverRequestRef.current !== requestId) return
        devError("server search failed:", err)
        setServerResults(EMPTY_RESULTS)
      })
  }, [serverMode, debouncedQuery])

  const handleSetQuery = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value)
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const clientResults = useMemo(
    () => (serverMode ? EMPTY_RESULTS : searchIndex(index, debouncedQuery)),
    [serverMode, index, debouncedQuery]
  )
  const results = serverMode ? serverResults : clientResults

  useEffect(() => {
    const normalizedQuery = debouncedQuery.trim()
    if (!isOpen || !normalizedQuery) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.SEARCH_QUERY_TYPED, {
      query: normalizedQuery,
      query_length: normalizedQuery.length,
      debounce_ms: DEBOUNCE_MS,
      total_results_count: results.total,
      account_results_count: results.accounts.totalMatches,
      center_results_count: results.centers.totalMatches,
      prospect_results_count: results.prospects.totalMatches,
    })
  }, [debouncedQuery, isOpen, results])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setQuery("")
    setDebouncedQuery("")
  }, [])

  return {
    query,
    setQuery: handleSetQuery,
    results,
    isOpen,
    setIsOpen,
    handleOpen,
    handleClose,
  }
}
