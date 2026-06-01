"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { Account, Alias, Center, Prospect } from "@/lib/types"
import { buildSearchIndex, searchIndex, type GroupedResults } from "@/lib/search"

interface UseGlobalSearchProps {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  aliases?: Alias[]
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
}: UseGlobalSearchProps): UseGlobalSearchReturn {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const index = useMemo(
    () => buildSearchIndex(accounts, centers, prospects, aliases ?? []),
    [accounts, centers, prospects, aliases]
  )

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

  const results = useMemo(
    () => searchIndex(index, debouncedQuery),
    [index, debouncedQuery]
  )

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
