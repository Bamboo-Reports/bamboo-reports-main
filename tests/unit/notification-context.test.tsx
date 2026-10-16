// @vitest-environment jsdom
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"

const getBrowserAccessToken = vi.hoisted(() => vi.fn())
const getSession = vi.hoisted(() => vi.fn())
const getUnreadCount = vi.hoisted(() => vi.fn())
const markAllAsRead = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/client", () => ({
  getBrowserAccessToken,
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}))
vi.mock("@/app/actions/notifications", () => ({
  getUnreadCount,
  getUnreadSummaries: vi.fn(async () => ({ success: true, data: [] })),
  getUnreadRecordSummaries: vi.fn(async () => ({ success: true, data: [], nextCursor: null })),
  markAllAsRead,
}))
vi.mock("@/lib/config/notifications", () => ({ NOTIFICATIONS_ENABLED: true }))

import { NotificationProvider, useNotificationContext } from "@/contexts/notification-context"

const wrapper = ({ children }: { children: ReactNode }) => <NotificationProvider>{children}</NotificationProvider>

// Signed in, with three unread notifications loaded.
async function renderSignedIn() {
  getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } })
  getBrowserAccessToken.mockResolvedValue("token-1")
  getUnreadCount.mockResolvedValue({ success: true, unreadCount: 3 })
  const hook = renderHook(() => useNotificationContext(), { wrapper })
  await waitFor(() => expect(hook.result.current.unreadCount).toBe(3))
  expect(hook.result.current.hasSession).toBe(true)
  return hook
}

describe("notification context token lookup", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it("shows an error instead of rejecting when the session lookup fails", async () => {
    const { result } = await renderSignedIn()
    getBrowserAccessToken.mockRejectedValue(new Error("network down"))

    await act(async () => {
      await expect(result.current.refreshAll()).resolves.toBeUndefined()
    })
    expect(result.current.error).toBe("Could not check your session. Try again shortly.")
    expect(result.current.hasSession).toBe(true)

    let marked: boolean | undefined
    await act(async () => {
      marked = await result.current.markAllAsRead()
    })
    expect(marked).toBe(false)
    expect(markAllAsRead).not.toHaveBeenCalled()
  })

  it("clears the bell when the session has quietly ended", async () => {
    const { result } = await renderSignedIn()
    getBrowserAccessToken.mockResolvedValue(null)

    await act(async () => {
      await result.current.refreshAll()
    })
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.hasSession).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
