"use client"

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

export const LOAD_ERROR_TOAST_ID = "dashboard-load-error"

/**
 * The header's refresh, the error state's retry, and the toast that reports a
 * failed fetch once data is already on screen. The toast is dismissed when
 * `filtersKey` changes, since the user has moved on.
 */
export function useDashboardRefresh(serverData: ServerDashboardData, filtersKey: string) {
  // A refresh keeps the current filters, so when the warehouse data is
  // unchanged the re-render is pixel-identical. The spinner plus a completion
  // toast are the only signals that the click did anything.
  const refreshing = serverData.isRefreshing
  const refreshRequestedRef = useRef(false)
  // Failure seq when the refresh was clicked: if it moved by the time the
  // refresh settles, the error toast reports it instead of "Data refreshed".
  const refreshStartFailureSeqRef = useRef(0)

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    refreshRequestedRef.current = true
    refreshStartFailureSeqRef.current = serverData.failure?.seq ?? 0
    toast.dismiss(LOAD_ERROR_TOAST_ID)
    serverData.reload()
  }, [serverData])

  useEffect(() => {
    if (refreshing || !refreshRequestedRef.current) return
    refreshRequestedRef.current = false
    if ((serverData.failure?.seq ?? 0) !== refreshStartFailureSeqRef.current) return
    toast.success("Data refreshed")
  }, [refreshing, serverData.failure])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    serverData.reload()
  }, [serverData])

  // Once data is on screen, the full-page error state no longer applies, so a
  // failed fetch is reported here; the previous data stays visible. The toast
  // stays until closed, retried, or the user moves on (filters or refresh),
  // so stale numbers are never shown without it.
  const shownFailureSeqRef = useRef(0)
  const failure = serverData.failure
  useEffect(() => {
    if (!failure || failure.seq === shownFailureSeqRef.current) return
    shownFailureSeqRef.current = failure.seq
    if (!serverData.summary) return
    captureEvent(ANALYTICS_EVENTS.ERROR_STATE_SHOWN, { error_message: failure.message })
    toast.error("Some data did not load", {
      id: LOAD_ERROR_TOAST_ID,
      description: failure.message,
      duration: Infinity,
      closeButton: true,
      action: { label: "Retry", onClick: handleErrorRetry },
    })
  }, [failure, serverData.summary, handleErrorRetry])

  useEffect(() => {
    toast.dismiss(LOAD_ERROR_TOAST_ID)
  }, [filtersKey])

  return { refreshing, handleRefresh, handleErrorRetry }
}
