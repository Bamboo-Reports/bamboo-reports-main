"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getUnreadCount,
  getUnreadSummaries,
  markAllAsRead as markAllAsReadAction,
  type NotificationSummary,
} from "@/app/actions/notifications"
import { NOTIFICATIONS_ENABLED } from "@/lib/config/notifications"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const REFRESH_INTERVAL_MS = 60_000

const NOTIFICATIONS_KEY = ["notifications"] as const
const UNREAD_COUNT_KEY = [...NOTIFICATIONS_KEY, "unread-count"] as const
const SUMMARIES_KEY = [...NOTIFICATIONS_KEY, "summaries"] as const

const EMPTY_SUMMARIES: NotificationSummary[] = []

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationState {
  unreadCount: number
  summaries: NotificationSummary[]
  loadingCount: boolean
  loadingSummaries: boolean
  error: string | null
  hasSession: boolean
}

interface NotificationActions {
  refreshAll: () => Promise<void>
  loadSummaries: () => Promise<void>
  markAllAsRead: () => Promise<boolean>
}

type NotificationContextValue = NotificationState & NotificationActions

const NotificationContext = createContext<NotificationContextValue | null>(null)

/** Unwraps a server action result, so a failure becomes the query's error. */
function unwrap<T extends { success: boolean; error?: string }>(result: T, fallback: string): T {
  if (!result.success) throw new Error(result.error ?? fallback)
  return result
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  // Summaries load on demand (the bell dropdown opening), not on page load.
  // The ref keeps loadSummaries stable, so the dropdown's load effect does
  // not run again (and refetch) when the first open enables the query.
  const [summariesWanted, setSummariesWanted] = useState(false)
  const summariesWantedRef = useRef(false)

  // --- Auth state (single listener for the whole app) ---
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) return
    if (typeof window === "undefined") return

    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setAccessToken(data.session?.access_token ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      setAccessToken(session?.access_token ?? null)
      if (!session?.access_token) {
        // Signed out: drop the previous user's notifications.
        summariesWantedRef.current = false
        setSummariesWanted(false)
        queryClient.removeQueries({ queryKey: NOTIFICATIONS_KEY })
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [queryClient])

  const hasSession = NOTIFICATIONS_ENABLED && Boolean(accessToken)

  // --- Unread count: polled, and refreshed when the tab regains focus.
  // Polling pauses while the tab is in the background. The token is read at
  // fetch time rather than keyed, so its hourly rotation does not refetch.
  const countQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => unwrap(await getUnreadCount(accessToken!), "Failed to fetch unread count.").unreadCount,
    enabled: hasSession,
    staleTime: 0,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })

  // --- Notification summaries (for the bell dropdown) ---
  const summariesQuery = useQuery({
    queryKey: SUMMARIES_KEY,
    queryFn: async () => unwrap(await getUnreadSummaries({ accessToken: accessToken! }), "Failed to fetch summaries.").data,
    enabled: hasSession && summariesWanted,
    staleTime: 0,
  })

  // --- Mark all as read ---
  const markAllMutation = useMutation({
    mutationFn: async () => unwrap(await markAllAsReadAction(accessToken!), "Failed to mark all as read."),
    onSuccess: () => {
      queryClient.setQueryData(UNREAD_COUNT_KEY, 0)
      queryClient.setQueryData(SUMMARIES_KEY, EMPTY_SUMMARIES)
    },
  })
  const { mutateAsync: markAllAsync, reset: resetMarkAll } = markAllMutation
  const { refetch: refetchCount } = countQuery
  const { refetch: refetchSummaries } = summariesQuery

  const refreshAll = useCallback(async () => {
    if (!hasSession) return
    await refetchCount()
  }, [hasSession, refetchCount])

  // Each dropdown open loads fresh summaries: the first enables the query,
  // later ones refetch it. A stale "mark all as read" error is cleared too.
  const loadSummaries = useCallback(async () => {
    if (!hasSession) return
    resetMarkAll()
    if (!summariesWantedRef.current) {
      summariesWantedRef.current = true
      setSummariesWanted(true)
      return
    }
    await refetchSummaries()
  }, [hasSession, refetchSummaries, resetMarkAll])

  const markAllAsRead = useCallback(async () => {
    if (!hasSession) return false
    try {
      await markAllAsync()
      return true
    } catch {
      return false
    }
  }, [hasSession, markAllAsync])

  // The most recent failure, if any piece is currently failing.
  const error = hasSession
    ? (markAllMutation.error ?? summariesQuery.error ?? countQuery.error)?.message ?? null
    : null

  const unreadCount = hasSession ? (countQuery.data ?? 0) : 0
  const summaries = hasSession ? (summariesQuery.data ?? EMPTY_SUMMARIES) : EMPTY_SUMMARIES
  const loadingCount = hasSession && countQuery.isFetching
  const loadingSummaries = hasSession && summariesQuery.isFetching

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      summaries,
      loadingCount,
      loadingSummaries,
      error,
      hasSession,
      refreshAll,
      loadSummaries,
      markAllAsRead,
    }),
    [unreadCount, summaries, loadingCount, loadingSummaries, error, hasSession, refreshAll, loadSummaries, markAllAsRead]
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
