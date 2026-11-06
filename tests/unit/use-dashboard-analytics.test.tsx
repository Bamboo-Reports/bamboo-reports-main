// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { captureEvent, identifyUser, setAnalyticsContext } from "@/lib/analytics/client"
import { useDashboardAnalytics, type UseDashboardAnalyticsParams } from "@/hooks/use-dashboard-analytics"
import type { Filters } from "@/lib/types"

vi.mock("@/lib/analytics/client", () => ({
  captureEvent: vi.fn(),
  ensureAnalyticsSession: vi.fn(),
  identifyUser: vi.fn(),
  setAnalyticsContext: vi.fn(),
}))
vi.mock("@/lib/analytics/tracking", () => ({ buildTrackedFiltersSnapshot: vi.fn(() => ({ snapshot: true })) }))

const FILTERS = {} as Filters
const RANGES = {
  revenue: { min: 0, max: 100 },
  yearsInIndia: { min: 0, max: 50 },
  centerIncYear: { min: 1990, max: 2026 },
}

const base: UseDashboardAnalyticsParams = {
  authReady: true,
  userId: "u1",
  userEmail: "a@b.c",
  userRole: "admin",
  activeSection: "accounts",
  accountsView: "map",
  centersView: "map",
  prospectsView: "chart",
  activeView: "map",
  activePage: 1,
  itemsPerPage: 50,
  filters: FILTERS,
  activeFiltersCount: 0,
  filteredCounts: { accounts: 10, centers: 20, prospects: 30 },
  ranges: RANGES,
  summary: null,
  pageError: null,
  dataLoaded: false,
}

const events = (name: string) => vi.mocked(captureEvent).mock.calls.filter(([e]) => e === name)

const setup = (overrides: Partial<UseDashboardAnalyticsParams> = {}) =>
  renderHook((props: UseDashboardAnalyticsParams) => useDashboardAnalytics(props), {
    initialProps: { ...base, ...overrides },
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(captureEvent).mockClear()
  vi.mocked(identifyUser).mockClear()
  vi.mocked(setAnalyticsContext).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useDashboardAnalytics", () => {
  it("does nothing session-related until auth is ready", () => {
    setup({ authReady: false })
    expect(identifyUser).not.toHaveBeenCalled()
    expect(events("session_started")).toHaveLength(0)
  })

  it("identifies the user, starts a session and ends it on unmount", () => {
    const { unmount } = setup()
    expect(identifyUser).toHaveBeenCalledWith({ id: "u1", email: "a@b.c", authProvider: "email", role: "admin" })
    expect(events("session_started")).toEqual([["session_started", { screen: "accounts" }]])
    act(() => vi.advanceTimersByTime(5000))
    unmount()
    expect(events("screen_time_spent")[0][1]).toMatchObject({ screen: "accounts", duration_seconds: 5, ended_reason: "session_end" })
    expect(events("session_ended")[0][1]).toMatchObject({ duration_seconds: 5, view_switch_count: 0, exports_count: 0 })
  })

  it("sets the analytics context from the current screen and counts", () => {
    setup({ activeFiltersCount: 2 })
    expect(setAnalyticsContext).toHaveBeenLastCalledWith({
      screen: "accounts",
      screen_view: "map",
      active_filters_count: 2,
      filtered_accounts_count: 10,
      filtered_centers_count: 20,
      filtered_prospects_count: 30,
      is_filtered: true,
    })
  })

  it("reports section, view and page changes and counts view switches", () => {
    const { rerender, unmount } = setup()
    act(() => vi.advanceTimersByTime(3000))
    rerender({ ...base, activeSection: "centers", activeView: "map" })
    expect(events("section_changed")).toEqual([["section_changed", { from_screen: "accounts", to_screen: "centers" }]])
    expect(events("screen_time_spent")[0][1]).toMatchObject({ screen: "accounts", duration_seconds: 3, ended_reason: "section_change" })

    rerender({ ...base, activeSection: "centers", centersView: "data", activeView: "data" })
    expect(events("section_view_changed")).toEqual([
      ["section_view_changed", { screen: "centers", from_view: "map", to_view: "data" }],
    ])

    rerender({ ...base, activeSection: "centers", centersView: "data", activeView: "data", activePage: 2 })
    expect(events("page_changed")).toEqual([["page_changed", { page: 2, items_per_page: 50, screen: "centers" }]])

    unmount()
    expect(events("session_ended")[0][1]).toMatchObject({ view_switch_count: 2 })
  })

  it("treats the section and view restored from the address bar as where the page opened", () => {
    const { rerender, unmount } = setup({ layoutRestored: false })
    // The address bar lands: centers in the data view, in the same render as layoutRestored.
    rerender({ ...base, layoutRestored: true, activeSection: "centers", centersView: "data", activeView: "data" })
    expect(events("section_changed")).toHaveLength(0)
    expect(events("section_view_changed")).toHaveLength(0)
    expect(events("screen_time_spent")).toHaveLength(0)

    // A real move afterwards is reported from the restored section.
    rerender({ ...base, layoutRestored: true, activeSection: "prospects", centersView: "data", activeView: "chart" })
    expect(events("section_changed")).toEqual([["section_changed", { from_screen: "centers", to_screen: "prospects" }]])

    unmount()
    expect(events("session_ended")[0][1]).toMatchObject({ view_switch_count: 1 })
  })

  it("reports an empty filter result once per filter state", () => {
    const empty = { accounts: 0, centers: 0, prospects: 0 }
    const { rerender } = setup({ activeFiltersCount: 1, filteredCounts: empty })
    expect(events("no_results_after_filter")).toHaveLength(1)
    expect(events("no_results_after_filter")[0][1]).toMatchObject({ active_filters_count: 1, filters_snapshot: { snapshot: true } })
    rerender({ ...base, activeFiltersCount: 1, filteredCounts: { ...empty } })
    expect(events("no_results_after_filter")).toHaveLength(1)
    rerender({ ...base, activeFiltersCount: 2, filteredCounts: empty })
    expect(events("no_results_after_filter")).toHaveLength(2)
  })

  it("waits for real counts before reporting the first load", () => {
    const { rerender } = setup({ authReady: false, userId: null, dataLoaded: true, summary: null })
    expect(events("dashboard_loaded")).toHaveLength(0)
    rerender({ ...base, dataLoaded: true, summary: null })
    expect(events("dashboard_loaded")).toHaveLength(0)
    const summary = { full: { accounts: 9, centers: 8, services: 7, prospects: 6 } } as UseDashboardAnalyticsParams["summary"]
    rerender({ ...base, dataLoaded: true, summary })
    expect(events("dashboard_loaded")).toEqual([
      ["dashboard_loaded", { total_accounts_count: 9, total_centers_count: 8, total_services_count: 7, total_prospects_count: 6 }],
    ])
  })

  it("reports the first load once and error states", () => {
    const summary = { full: { accounts: 1, centers: 2, services: 3, prospects: 4 } } as UseDashboardAnalyticsParams["summary"]
    const { rerender } = setup({ dataLoaded: true, summary })
    expect(events("dashboard_loaded")).toEqual([
      ["dashboard_loaded", { total_accounts_count: 1, total_centers_count: 2, total_services_count: 3, total_prospects_count: 4 }],
    ])
    rerender({ ...base, dataLoaded: true, summary, pageError: "boom" })
    expect(events("dashboard_loaded")).toHaveLength(1)
    expect(events("error_state_shown")).toEqual([["error_state_shown", { error_message: "boom" }]])
  })

  it("sends heartbeats with the export count, and idle and resume events", () => {
    const { result } = setup()
    act(() => result.current.trackExportCompleted())
    act(() => vi.advanceTimersByTime(60000))
    expect(events("session_heartbeat")[0][1]).toMatchObject({ elapsed_seconds: 60, exports_count: 1 })
    expect(events("session_idle_started")).toHaveLength(1)
    act(() => window.dispatchEvent(new Event("keydown")))
    expect(events("session_resumed")).toEqual([["session_resumed", { resumed_via: "user_activity" }]])
  })
})
