// @vitest-environment jsdom
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { NotificationProvider, useNotificationContext } from "@/contexts/notification-context"
import { getUnreadCount, getUnreadSummaries, markAllAsRead, type NotificationSummary } from "@/app/actions/notifications"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/config/notifications", () => ({ NOTIFICATIONS_ENABLED: true }))
vi.mock("@/app/actions/notifications", () => ({
  getUnreadCount: vi.fn(),
  getUnreadSummaries: vi.fn(),
  markAllAsRead: vi.fn(),
}))

type AuthCallback = (event: string, session: { access_token: string } | null) => void
let session: { access_token: string } | null = null
let authCallback: AuthCallback = () => {}
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  }),
}))

const countMock = vi.mocked(getUnreadCount)
const summariesMock = vi.mocked(getUnreadSummaries)
const markMock = vi.mocked(markAllAsRead)

const SUMMARY = { table_name: "accounts", record_count: 3 } as unknown as NotificationSummary

function renderNotifications() {
  const QueryWrapper = createQueryWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryWrapper>
      <NotificationProvider>{children}</NotificationProvider>
    </QueryWrapper>
  )
  return renderHook(() => useNotificationContext(), { wrapper })
}

describe("NotificationProvider", () => {
  beforeEach(() => {
    session = { access_token: "token-1" }
    countMock.mockReset().mockResolvedValue({ success: true, unreadCount: 3 })
    summariesMock.mockReset().mockResolvedValue({ success: true, data: [SUMMARY] })
    markMock.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("fetches nothing without a session", async () => {
    session = null
    const { result } = renderNotifications()
    await act(async () => {})
    expect(result.current).toMatchObject({ hasSession: false, unreadCount: 0, summaries: [] })
    expect(countMock).not.toHaveBeenCalled()
  })

  it("loads the unread count on sign-in and polls it every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.unreadCount).toBe(3))
    expect(countMock).toHaveBeenCalledWith("token-1")

    countMock.mockResolvedValue({ success: true, unreadCount: 5 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await waitFor(() => expect(result.current.unreadCount).toBe(5))
  })

  it("loads summaries once on the first open and fresh on each later open", async () => {
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.hasSession).toBe(true))
    expect(summariesMock).not.toHaveBeenCalled()

    await act(async () => result.current.loadSummaries())
    await waitFor(() => expect(result.current.summaries).toEqual([SUMMARY]))
    expect(summariesMock).toHaveBeenCalledTimes(1)

    await act(async () => result.current.loadSummaries())
    await waitFor(() => expect(summariesMock).toHaveBeenCalledTimes(2))
  })

  it("clears the count and summaries after marking all as read", async () => {
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.unreadCount).toBe(3))
    await act(async () => result.current.loadSummaries())
    await waitFor(() => expect(result.current.summaries).toEqual([SUMMARY]))

    let ok = false
    await act(async () => {
      ok = await result.current.markAllAsRead()
    })
    expect(ok).toBe(true)
    await waitFor(() => expect(result.current).toMatchObject({ unreadCount: 0, summaries: [], error: null }))
  })

  it("reports a failed mark-all-as-read and keeps the count", async () => {
    markMock.mockResolvedValue({ success: false, error: "Nope" })
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.unreadCount).toBe(3))

    let ok = true
    await act(async () => {
      ok = await result.current.markAllAsRead()
    })
    expect(ok).toBe(false)
    await waitFor(() => expect(result.current.error).toBe("Nope"))
    expect(result.current.unreadCount).toBe(3)
  })

  it("clears everything on sign-out", async () => {
    const { result } = renderNotifications()
    await waitFor(() => expect(result.current.unreadCount).toBe(3))

    await act(async () => authCallback("SIGNED_OUT", null))
    expect(result.current).toMatchObject({ hasSession: false, unreadCount: 0, summaries: [] })
  })
})
