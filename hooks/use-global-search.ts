"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { devError } from "@/lib/utils/dev-log"
import type { SearchResponse } from "@/lib/dashboard/api-client"
import { searchQuery } from "@/lib/dashboard/queries"
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
  /** True from keystroke until the (debounced) lookup for it resolves. */
  isSearching: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  handleOpen: () => void
  handleClose: () => void
}

const DEBOUNCE_MS = 300

type ServerGroup = SearchResponse["accounts"]

function toGroupedResults(res: SearchResponse) {
  const group = (g: ServerGroup): GroupedResults => ({
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
  return { accounts: group(res.accounts), centers: group(res.centers), prospects: group(res.prospects), total: res.total }
}

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const index = useMemo(
    () => (serverMode ? buildSearchIndex([], [], [], []) : buildSearchIndex(accounts, centers, prospects, aliases ?? [])),
    [serverMode, accounts, centers, prospects, aliases]
  )

  // Server mode: grouped results for the debounced query. Previous results
  // stay on screen while the next query loads (keepPreviousData); a failed
  // lookup shows no results.
  const term = debouncedQuery.trim()
  const serverEnabled = serverMode && term.length >= 2
  const serverQuery = useQuery({ ...searchQuery(term), enabled: serverEnabled, placeholderData: keepPreviousData })
  const serverError = serverQuery.error
  useEffect(() => {
    if (serverError) devError("server search failed:", serverError)
  }, [serverError])
  // Placeholder data ignores `enabled`, so gate on it: short terms show nothing.
  const serverData = serverEnabled ? serverQuery.data : undefined
  const serverResults = useMemo(() => (serverData ? toGroupedResults(serverData) : EMPTY_RESULTS), [serverData])

  // Searching runs from the keystroke until the lookup for the typed query
  // resolves. It is derived from the debounced term and the query state, never
  // stored, so typing a character and deleting it within the debounce lands
  // back on a resolved query instead of sticking (#288).
  const settled = !serverEnabled || (!serverQuery.isPending && !serverQuery.isPlaceholderData)
  const trimmedQuery = query.trim()
  const isSearching = trimmedQuery.length >= 2 && (trimmedQuery !== term || !settled)

  const handleSetQuery = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(value)
      }, DEBOUNCE_MS)
    },
    []
  )

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
    isSearching,
    isOpen,
    setIsOpen,
    handleOpen,
    handleClose,
  }
}
