// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { LOAD_ERROR_TOAST_ID, useDashboardRefresh } from "@/hooks/use-dashboard-refresh"
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
  it("refresh reloads, dismisses the error toast and confirms when it settles cleanly", () => {
    const { result, rerender } = setup(data())
    act(() => result.current.handleRefresh())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith("data_refresh_clicked")
    expect(toast.dismiss).toHaveBeenCalledWith(LOAD_ERROR_TOAST_ID)
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
    expect(vi.mocked(toast.error).mock.calls[0][1]).toMatchObject({ id: LOAD_ERROR_TOAST_ID, description: "second" })
    expect(captureEvent).toHaveBeenCalledWith("error_state_shown", { error_message: "second" })
  })

  it("dismisses the failure toast when the filters change", () => {
    const { rerender } = setup(data())
    vi.mocked(toast.dismiss).mockClear()
    rerender({ d: data(), k: "f1" })
    expect(toast.dismiss).not.toHaveBeenCalled()
    rerender({ d: data(), k: "f2" })
    expect(toast.dismiss).toHaveBeenCalledWith(LOAD_ERROR_TOAST_ID)
  })

  it("retry reloads and is tracked", () => {
    const { result } = setup(data())
    act(() => result.current.handleErrorRetry())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith("error_retry_clicked")
  })
})
