"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchAccountRelated, type AccountRelatedResponse } from "@/lib/dashboard/api-client"

interface AccountRelatedState {
  data: AccountRelatedResponse | null
  loading: boolean
  error: boolean
  retry: () => void
}

/**
 * Loads an account's related centres, prospects and tech for the record
 * dialogs. An empty name means the data is not needed and clears the state.
 * A failed request ends loading and sets `error`, so callers can offer a retry
 * instead of a skeleton that never resolves. fetchAccountRelated drops failed
 * requests from its cache, so `retry` makes a fresh request.
 */
export function useAccountRelated(name: string): AccountRelatedState {
  const [data, setData] = useState<AccountRelatedResponse | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setData(null)
    setError(false)
    if (!name) return
    let cancelled = false
    fetchAccountRelated(name)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [name, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading: !!name && data === null && !error, error, retry }
}
