"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  getUnreadCount,
  getUnreadSummaries,
  getUnreadRecordSummaries,
  markAllAsRead as markAllAsReadAction,
  type NotificationSummary,
  type RecordUpdateSummary,
} from "@/app/actions/notifications"
import { NOTIFICATIONS_ENABLED } from "@/lib/config/notifications"
import { getBrowserAccessToken, getSupabaseBrowserClient } from "@/lib/supabase/client"

const REFRESH_INTERVAL_MS = 60_000
const RECORD_SUMMARIES_PAGE_SIZE = 100
const MAX_RECORD_SUMMARY_PAGES = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationState {
  unreadCount: number
  summaries: NotificationSummary[]
  recordSummaries: Record<string, RecordUpdateSummary[]>
  loadingCount: boolean
  loadingSummaries: boolean
  loadingRecords: Record<string, boolean>
  error: string | null
  hasSession: boolean
}

interface NotificationActions {
  refreshAll: () => Promise<void>
  loadSummaries: () => Promise<void>
  loadRecordSummaries: (tableName: string) => Promise<void>
  markAllAsRead: () => Promise<boolean>
}

type NotificationContextValue = NotificationState & NotificationActions

const NotificationContext = createContext<NotificationContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Only gates requests; each request reads a fresh token (see getFreshAccessToken).
  const [signedIn, setSignedIn] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [summaries, setSummaries] = useState<NotificationSummary[]>([])
  const [recordSummaries, setRecordSummaries] = useState<Record<string, RecordUpdateSummary[]>>({})
  const [loadingCount, setLoadingCount] = useState(false)
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const clearNotifications = useCallback(() => {
    setUnreadCount(0)
    setSummaries([])
    setRecordSummaries({})
    setError(null)
  }, [])

  // --- Auth state (single listener for the whole app) ---
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return
    if (typeof window === "undefined") return

    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSignedIn(Boolean(data.session?.access_token))
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setSignedIn(Boolean(session?.access_token))
      if (!session?.access_token) clearNotifications()
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [clearNotifications])

  // A token kept from auth events goes stale when a background tab misses
  // Supabase's auto-refresh, so each request reads a fresh one. Never throws:
  // a session that has quietly ended clears the bell like a sign-out, and a
  // failed lookup (for example a refresh on a flaky network) shows an error.
  // Both return null.
  const getFreshAccessToken = useCallback(async () => {
    try {
      const token = await getBrowserAccessToken()
      if (!token) {
        setSignedIn(false)
        clearNotifications()
      }
      return token
    } catch {
      setError("Could not check your session. Try again shortly.")
      return null
    }
  }, [clearNotifications])

  // --- Refresh unread count ---
  const refreshUnreadCount = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !signedIn) {
      setUnreadCount(0)
      return
    }
    setLoadingCount(true)
    try {
      const token = await getFreshAccessToken()
      if (!token) return
      const result = await getUnreadCount(token)
      if (!result.success) {
        setError(result.error ?? "Failed to fetch unread count.")
        return
      }
      setUnreadCount(result.unreadCount)
      setError(null)
    } finally {
      setLoadingCount(false)
    }
  }, [signedIn, getFreshAccessToken])

  // --- Load notification summaries (for the bell dropdown) ---
  const loadSummaries = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !signedIn) {
      setSummaries([])
      return
    }
    setLoadingSummaries(true)
    try {
      const token = await getFreshAccessToken()
      if (!token) return
      const result = await getUnreadSummaries({ accessToken: token })
      if (!result.success) {
        setError(result.error ?? "Failed to fetch summaries.")
        return
      }
      setSummaries(result.data)
      setError(null)
    } finally {
      setLoadingSummaries(false)
    }
  }, [signedIn, getFreshAccessToken])

  // --- Load per-record summaries for a table (for recently-updated indicators) ---
  const loadRecordSummaries = useCallback(
    async (tableName: string) => {
      if (!NOTIFICATIONS_ENABLED || !signedIn) {
        setRecordSummaries((prev) => ({ ...prev, [tableName]: [] }))
        return
      }
      setLoadingRecords((prev) => ({ ...prev, [tableName]: true }))
      try {
        const token = await getFreshAccessToken()
        if (!token) return
        const merged: RecordUpdateSummary[] = []
        let cursor: { changedAt: string; recordKey: string } | null = null
        for (let page = 0; page < MAX_RECORD_SUMMARY_PAGES; page++) {
          const result = await getUnreadRecordSummaries({
            accessToken: token,
            tableName,
            limit: RECORD_SUMMARIES_PAGE_SIZE,
            cursorChangedAt: cursor?.changedAt ?? null,
            cursorRecordKey: cursor?.recordKey ?? null,
          })
          if (!result.success) {
            setError(result.error ?? "Failed to fetch record summaries.")
            return
          }
          merged.push(...result.data)
          cursor = result.nextCursor ?? null
          if (!cursor) break
        }
        setRecordSummaries((prev) => ({ ...prev, [tableName]: merged }))
        setError(null)
      } finally {
        setLoadingRecords((prev) => ({ ...prev, [tableName]: false }))
      }
    },
    [signedIn, getFreshAccessToken]
  )

  // --- Refresh everything (count + all loaded record tables) ---
  const refreshAll = useCallback(async () => {
    await refreshUnreadCount()
    const loadedTables = Object.keys(recordSummaries)
    await Promise.all(loadedTables.map((t) => loadRecordSummaries(t)))
  }, [refreshUnreadCount, recordSummaries, loadRecordSummaries])

  // --- Mark all as read ---
  const markAllAsRead = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !signedIn) return false

    const token = await getFreshAccessToken()
    if (!token) return false
    const result = await markAllAsReadAction(token)
    if (!result.success) {
      setError(result.error ?? "Failed to mark all as read.")
      return false
    }

    setUnreadCount(0)
    setSummaries([])
    setRecordSummaries((prev) => {
      const cleared: Record<string, RecordUpdateSummary[]> = {}
      for (const key of Object.keys(prev)) {
        cleared[key] = []
      }
      return cleared
    })
    setError(null)
    return true
  }, [signedIn, getFreshAccessToken])

  // --- Initial load + polling ---
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return
    void refreshUnreadCount()
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED || !signedIn) return
    const intervalId = window.setInterval(() => {
      void refreshAll()
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [signedIn, refreshAll])

  const hasSession = NOTIFICATIONS_ENABLED && signedIn

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      summaries,
      recordSummaries,
      loadingCount,
      loadingSummaries,
      loadingRecords,
      error,
      hasSession,
      refreshAll,
      loadSummaries,
      loadRecordSummaries,
      markAllAsRead,
    }),
    [
      unreadCount,
      summaries,
      recordSummaries,
      loadingCount,
      loadingSummaries,
      loadingRecords,
      error,
      hasSession,
      refreshAll,
      loadSummaries,
      loadRecordSummaries,
      markAllAsRead,
    ]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error("useNotificationContext must be used within a NotificationProvider")
  }
  return ctx
}
