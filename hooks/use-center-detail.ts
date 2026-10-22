"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchCenterDetail, type CenterDetailResponse } from "@/lib/dashboard/api-client"

interface CenterDetailState {
  data: CenterDetailResponse | null
  loading: boolean
  error: boolean
  retry: () => void
}

/**
 * Loads a centre's services and tech for the centre details dialog. An empty
 * key means the data is not needed and clears the state. A failed request
 * ends loading and sets `error`, so the dialog can offer a retry instead of
 * skeletons that never resolve (#287). Mirrors useAccountRelated.
 */
export function useCenterDetail(key: string): CenterDetailState {
  const [data, setData] = useState<CenterDetailResponse | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setData(null)
    setError(false)
    if (!key) return
    let cancelled = false
    fetchCenterDetail(key)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading: !!key && data === null && !error, error, retry }
}
