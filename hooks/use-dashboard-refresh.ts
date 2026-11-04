"use client"

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

export const LOAD_ERROR_TOAST_PREFIX = "dashboard-load-error"

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

  // The failure toast on screen, if any. sonner applies a dismiss one frame
  // late, so a toast created with the same id inside that frame (a request
  // that fails at once, e.g. offline) would be removed with the old one.
  // Each dismissed toast's id is retired; the next failure gets a new id.
  const errorToastIdRef = useRef<string | null>(null)
  const errorToastCountRef = useRef(0)
  const dismissErrorToast = useCallback(() => {
    if (errorToastIdRef.current === null) return
    toast.dismiss(errorToastIdRef.current)
    errorToastIdRef.current = null
  }, [])

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    refreshRequestedRef.current = true
    refreshStartFailureSeqRef.current = serverData.failure?.seq ?? 0
    dismissErrorToast()
    serverData.reload()
  }, [serverData, dismissErrorToast])

  useEffect(() => {
    if (refreshing || !refreshRequestedRef.current) return
    refreshRequestedRef.current = false
    if ((serverData.failure?.seq ?? 0) !== refreshStartFailureSeqRef.current) return
    toast.success("Data refreshed")
  }, [refreshing, serverData.failure])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    // The toast's Retry closes the toast itself (without onDismiss).
    errorToastIdRef.current = null
    serverData.reload()
  }, [serverData])

  // Moving on to other filters drops the toast. This runs before the failure
  // effect below, so a failure that lands in the same render still shows.
  useEffect(() => {
    dismissErrorToast()
  }, [filtersKey, dismissErrorToast])

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
    // A toast already on screen is updated in place; otherwise use a fresh id.
    if (errorToastIdRef.current === null) {
      errorToastCountRef.current += 1
      errorToastIdRef.current = `${LOAD_ERROR_TOAST_PREFIX}-${errorToastCountRef.current}`
    }
    const id = errorToastIdRef.current
    const forget = () => {
      if (errorToastIdRef.current === id) errorToastIdRef.current = null
    }
    toast.error("Some data did not load", {
      id,
      description: failure.message,
      duration: Infinity,
      closeButton: true,
      action: { label: "Retry", onClick: handleErrorRetry },
      onDismiss: forget,
      onAutoClose: forget,
    })
  }, [failure, serverData.summary, handleErrorRetry])

  return { refreshing, handleRefresh, handleErrorRetry }
}
