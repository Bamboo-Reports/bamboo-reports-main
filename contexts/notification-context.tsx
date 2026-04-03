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
} from "@/app/actions"
import { NOTIFICATIONS_ENABLED } from "@/lib/config/notifications"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

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
  const supabase = getSupabaseBrowserClient()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [summaries, setSummaries] = useState<NotificationSummary[]>([])
  const [recordSummaries, setRecordSummaries] = useState<Record<string, RecordUpdateSummary[]>>({})
  const [loadingCount, setLoadingCount] = useState(false)
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  // --- Auth state (single listener for the whole app) ---
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setAccessToken(data.session?.access_token ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setAccessToken(session?.access_token ?? null)
      if (!session?.access_token) {
        setUnreadCount(0)
        setSummaries([])
        setRecordSummaries({})
        setError(null)
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  // --- Refresh unread count ---
  const refreshUnreadCount = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !accessToken) {
      setUnreadCount(0)
      return
    }
    setLoadingCount(true)
    try {
      const result = await getUnreadCount(accessToken)
      if (!result.success) {
        setError(result.error ?? "Failed to fetch unread count.")
        return
      }
      setUnreadCount(result.unreadCount)
      setError(null)
    } finally {
      setLoadingCount(false)
    }
  }, [accessToken])

  // --- Load notification summaries (for the bell dropdown) ---
  const loadSummaries = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !accessToken) {
      setSummaries([])
      return
    }
    setLoadingSummaries(true)
    try {
      const result = await getUnreadSummaries({ accessToken })
      if (!result.success) {
        setError(result.error ?? "Failed to fetch summaries.")
        return
      }
      setSummaries(result.data)
      setError(null)
    } finally {
      setLoadingSummaries(false)
    }
  }, [accessToken])

  // --- Load per-record summaries for a table (for recently-updated indicators) ---
  const loadRecordSummaries = useCallback(
    async (tableName: string) => {
      if (!NOTIFICATIONS_ENABLED || !accessToken) {
        setRecordSummaries((prev) => ({ ...prev, [tableName]: [] }))
        return
      }
      setLoadingRecords((prev) => ({ ...prev, [tableName]: true }))
      try {
        const merged: RecordUpdateSummary[] = []
        for (let page = 0; page < MAX_RECORD_SUMMARY_PAGES; page++) {
          const result = await getUnreadRecordSummaries({
            accessToken,
            tableName,
            limit: RECORD_SUMMARIES_PAGE_SIZE,
            offset: page * RECORD_SUMMARIES_PAGE_SIZE,
          })
          if (!result.success) {
            setError(result.error ?? "Failed to fetch record summaries.")
            return
          }
          merged.push(...result.data)
          if (result.data.length < RECORD_SUMMARIES_PAGE_SIZE) break
        }
        setRecordSummaries((prev) => ({ ...prev, [tableName]: merged }))
        setError(null)
      } finally {
        setLoadingRecords((prev) => ({ ...prev, [tableName]: false }))
      }
    },
    [accessToken]
  )

  // --- Refresh everything (count + all loaded record tables) ---
  const refreshAll = useCallback(async () => {
    await refreshUnreadCount()
    const loadedTables = Object.keys(recordSummaries)
    await Promise.all(loadedTables.map((t) => loadRecordSummaries(t)))
  }, [refreshUnreadCount, recordSummaries, loadRecordSummaries])

  // --- Mark all as read ---
  const markAllAsRead = useCallback(async () => {
    if (!NOTIFICATIONS_ENABLED || !accessToken) return false

    const result = await markAllAsReadAction(accessToken)
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
  }, [accessToken])

  // --- Initial load + polling ---
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return
    void refreshUnreadCount()
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED || !accessToken) return
    const intervalId = window.setInterval(() => {
      void refreshAll()
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [accessToken, refreshAll])

  const hasSession = NOTIFICATIONS_ENABLED && Boolean(accessToken)

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
