// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { useDashboardRefresh } from "@/hooks/use-dashboard-refresh"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))

type Data = Pick<ServerDashboardData, "isRefreshing" | "failure" | "summary" | "reload">
const reload = vi.fn()
const data = (over: Partial<Data> = {}) =>
  ({ isRefreshing: false, failure: null, summary: { filtered: {} }, reload, ...over }) as unknown as ServerDashboardData

const setup = (initial: ServerDashboardData, key = "f1") =>
  renderHook(({ d, k }) => useDashboardRefresh(d, k), { initialProps: { d: initial, k: key } })

beforeEach(() => {
  vi.mocked(captureEvent).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.dismiss).mockClear()
  reload.mockClear()
})
afterEach(() => cleanup())

describe("useDashboardRefresh", () => {
  it("refresh reloads and confirms when it settles cleanly", () => {
    const { result, rerender } = setup(data())
    act(() => result.current.handleRefresh())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith("data_refresh_clicked")
    rerender({ d: data({ isRefreshing: true }), k: "f1" })
    expect(toast.success).not.toHaveBeenCalled()
    rerender({ d: data({ isRefreshing: false }), k: "f1" })
    expect(toast.success).toHaveBeenCalledWith("Data refreshed")
  })

  it("does not confirm a refresh that failed", () => {
    const { result, rerender } = setup(data())
    act(() => result.current.handleRefresh())
    rerender({ d: data({ isRefreshing: true }), k: "f1" })
    rerender({ d: data({ isRefreshing: false, failure: { seq: 1, message: "down" } }), k: "f1" })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("shows a failure toast once per failure, only when data is on screen", () => {
    const { rerender } = setup(data({ summary: null, failure: { seq: 1, message: "first" } }))
    expect(toast.error).not.toHaveBeenCalled()
    const failing = data({ failure: { seq: 2, message: "second" } })
    rerender({ d: failing, k: "f1" })
    rerender({ d: failing, k: "f1" })
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error).mock.calls[0][1]).toMatchObject({ id: "dashboard-load-error-1", description: "second" })
    expect(captureEvent).toHaveBeenCalledWith("error_state_shown", { error_message: "second" })
  })

  it("dismisses the failure toast when the filters change", () => {
    const { rerender } = setup(data({ failure: { seq: 1, message: "down" } }))
    rerender({ d: data({ failure: { seq: 1, message: "down" } }), k: "f1" })
    expect(toast.dismiss).not.toHaveBeenCalled()
    rerender({ d: data({ failure: { seq: 1, message: "down" } }), k: "f2" })
    expect(toast.dismiss).toHaveBeenCalledWith("dashboard-load-error-1")
  })

  it("shows a failure that arrives in the same render as a filter change", () => {
    const { rerender } = setup(data())
    rerender({ d: data({ failure: { seq: 1, message: "down" } }), k: "f2" })
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  it("does not dismiss anything when no failure toast is showing", () => {
    const { result, rerender } = setup(data())
    rerender({ d: data(), k: "f2" })
    act(() => result.current.handleRefresh())
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  // sonner applies a dismiss one frame late: a failure right after a refresh
  // must not reuse the id being dismissed, or its toast is removed too.
  it("a failure right after a refresh gets a new toast id", () => {
    const { result, rerender } = setup(data({ failure: { seq: 1, message: "first" } }))
    act(() => result.current.handleRefresh())
    expect(toast.dismiss).toHaveBeenCalledWith("dashboard-load-error-1")
    rerender({ d: data({ failure: { seq: 2, message: "again" } }), k: "f1" })
    expect(vi.mocked(toast.error).mock.calls.map(([, o]) => (o as { id: string }).id)).toEqual([
      "dashboard-load-error-1",
      "dashboard-load-error-2",
    ])
  })

  it("updates the toast in place while it is showing", () => {
    const { rerender } = setup(data({ failure: { seq: 1, message: "a" } }))
    rerender({ d: data({ failure: { seq: 2, message: "b" } }), k: "f1" })
    expect(vi.mocked(toast.error).mock.calls.map(([, o]) => (o as { id: string }).id)).toEqual([
      "dashboard-load-error-1",
      "dashboard-load-error-1",
    ])
    expect(toast.dismiss).not.toHaveBeenCalled()
  })

  it("uses a new id after the toast is closed or retried", () => {
    const { result, rerender } = setup(data({ failure: { seq: 1, message: "a" } }))
    const first = vi.mocked(toast.error).mock.calls[0][1] as { onDismiss: () => void }
    act(() => first.onDismiss())
    rerender({ d: data({ failure: { seq: 2, message: "b" } }), k: "f1" })
    act(() => result.current.handleErrorRetry())
    rerender({ d: data({ failure: { seq: 3, message: "c" } }), k: "f1" })
    expect(vi.mocked(toast.error).mock.calls.map(([, o]) => (o as { id: string }).id)).toEqual([
      "dashboard-load-error-1",
      "dashboard-load-error-2",
      "dashboard-load-error-3",
    ])
  })

  it("retry reloads and is tracked", () => {
    const { result } = setup(data())
    act(() => result.current.handleErrorRetry())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith("error_retry_clicked")
  })
})
