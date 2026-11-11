// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { captureEvent } from "@/lib/analytics/client"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import type { Filters, FilterValue } from "@/lib/types"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))

// Server mode, as the dashboard uses it: no client arrays, ranges from facets.
const RANGES = {
  revenue: { min: 1, max: 1000 },
  yearsInIndia: { min: 1, max: 50 },
  centerIncYear: { min: 1990, max: 2030 },
}
const EMPTY: never[] = []

const setup = (ranges = RANGES) =>
  renderHook(({ serverRanges }) =>
    useDashboardFilters({
      accounts: EMPTY,
      centers: EMPTY,
      functions: EMPTY,
      services: EMPTY,
      prospects: EMPTY,
      tech: EMPTY,
      serverRanges,
    }),
    { initialProps: { serverRanges: ranges } }
  )

const inc = (value: string): FilterValue => ({ value, mode: "include" })
const exc = (value: string): FilterValue => ({ value, mode: "exclude" })
const events = (name: string) => vi.mocked(captureEvent).mock.calls.filter(([e]) => e === name).map(([, p]) => p)

type Hook = ReturnType<typeof setup>["result"]
const change = (result: Hook, update: (prev: Filters) => Filters) => {
  act(() => result.current.setPendingFilters(update))
}
const flushTracking = () => act(() => vi.advanceTimersByTime(350))
// Lets the load-time tracking settle and forgets anything it sent, so a
// test sees only its own changes.
const settle = () => {
  flushTracking()
  vi.mocked(captureEvent).mockClear()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(captureEvent).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useDashboardFilters", () => {
  it("starts from the server ranges with no active filters", () => {
    const { result } = setup()
    expect(result.current.filters.accountHqRevenueRange).toEqual([1, 1000])
    expect(result.current.filters.accountYearsInIndiaRange).toEqual([1, 50])
    expect(result.current.filters.centerIncYearRange).toEqual([1990, 2030])
    expect(result.current.revenueRange).toEqual(RANGES.revenue)
    expect(result.current.getTotalActiveFilters()).toBe(0)
  })

  it("applies pending filters", () => {
    const { result } = setup()
    change(result, (f) => ({ ...f, centerCityValues: [inc("Pune")] }))
    expect(result.current.filters.centerCityValues).toEqual([inc("Pune")])
  })

  it("counts fields, a non-default visibility, narrowed ranges and switched-off toggles", () => {
    const { result } = setup()
    change(result, (f) => ({
      ...f,
      accountHqRegionValues: [inc("Europe"), exc("Asia")],
      accountVisibilityMode: "nonGcc",
      accountHqRevenueRange: [5, 1000],
      centerIncYearRange: [2000, 2030],
      yearsInIndiaIncludeNull: false,
      prospectTitleKeywords: [inc("cto")],
    }))
    // Regions (one field, two values) + visibility + revenue range + inc-year range + years toggle + keyword
    expect(result.current.getTotalActiveFilters()).toBe(6)
  })

  it("counts account names and lists as one field", () => {
    const { result } = setup()
    change(result, (f) => ({ ...f, accountNameValues: [inc("A"), inc("B"), inc("C")] }))
    expect(result.current.getTotalActiveFilters()).toBe(1)
    change(result, (f) => ({ ...f, accountListValues: [inc("list-1")] }))
    expect(result.current.getTotalActiveFilters()).toBe(1)
  })

  it("resets to the base ranges and reports it only when something was active", () => {
    const { result } = setup()
    act(() => result.current.resetFilters())
    expect(events("filters_reset")).toHaveLength(0)

    change(result, (f) => ({ ...f, centerCityValues: [inc("Pune")], accountHqRevenueRange: [5, 500] }))
    act(() => result.current.resetFilters())
    expect(result.current.filters.centerCityValues).toEqual([])
    expect(result.current.filters.accountHqRevenueRange).toEqual([1, 1000])
    expect(result.current.getTotalActiveFilters()).toBe(0)
    const [reset] = events("filters_reset") as Array<Record<string, unknown>>
    expect(reset.previous_active_filters_count).toBe(2)
    expect(reset.previous_filters_snapshot).toMatchObject({ center_cities: ["include:Pune"] })
  })

  it("pulls a saved filter's ranges back inside today's bounds", () => {
    const { result } = setup()
    const saved = { ...result.current.filters, accountHqRevenueRange: [0, 5000] as [number, number], centerIncYearRange: [1980, 2000] as [number, number] }
    act(() => result.current.handleLoadSavedFilters(saved))
    expect(result.current.filters.accountHqRevenueRange).toEqual([1, 1000])
    expect(result.current.filters.centerIncYearRange).toEqual([1990, 2000])
  })

  it("range sliders update the pending filters", () => {
    const { result } = setup()
    act(() => {
      result.current.handleRevenueRangeChange([10, 20])
      result.current.handleYearsInIndiaRangeChange([2, 3])
      result.current.handleCenterIncYearRangeChange([2001, 2002])
    })
    expect(result.current.filters).toMatchObject({
      accountHqRevenueRange: [10, 20],
      accountYearsInIndiaRange: [2, 3],
      centerIncYearRange: [2001, 2002],
    })
  })

  it("moves an untouched revenue range to new server bounds", () => {
    const { result, rerender } = setup()
    rerender({ serverRanges: { ...RANGES, revenue: { min: 1, max: 800 } } })
    expect(result.current.filters.accountHqRevenueRange).toEqual([1, 800])
  })

  // A link or saved filter can set a range before the data's limits arrive;
  // the limits arriving must not throw that range away.
  it("keeps a narrowed range when the server bounds change, pulled inside them", () => {
    const { result, rerender } = setup()
    rerender({ serverRanges: { ...RANGES, revenue: { min: 1, max: 800 } } })

    act(() => {
      result.current.handleRevenueRangeChange([100, 700])
      result.current.handleYearsInIndiaRangeChange([2, 3])
    })
    rerender({ serverRanges: { ...RANGES, revenue: { min: 1, max: 600 } } })
    expect(result.current.filters.accountHqRevenueRange).toEqual([100, 600])
    expect(result.current.filters.accountYearsInIndiaRange).toEqual([2, 3])
  })

  describe("filters applied before the data's limits arrive (a link)", () => {
    // No server ranges yet: the hook holds the placeholder limits.
    const setupBeforeLimits = () => setup(null as unknown as typeof RANGES)
    const linkFilters = (result: Hook, ranges: Partial<Filters>): Filters => ({ ...result.current.filters, ...ranges })

    it("keeps a narrowed range and lets the others follow the limits", () => {
      const { result, rerender } = setupBeforeLimits()
      act(() =>
        result.current.handleLoadSavedFilters(linkFilters(result, { accountHqRevenueRange: [100, 700] }), { clampRanges: false })
      )
      rerender({ serverRanges: RANGES })
      expect(result.current.filters.accountHqRevenueRange).toEqual([100, 700])
      expect(result.current.filters.accountYearsInIndiaRange).toEqual([1, 50])
      expect(result.current.filters.centerIncYearRange).toEqual([1990, 2030])
    })

    it("keeps a range wider than the placeholder limits", () => {
      const { result, rerender } = setupBeforeLimits()
      act(() =>
        result.current.handleLoadSavedFilters(linkFilters(result, { accountHqRevenueRange: [0, 2_000_000] }), { clampRanges: false })
      )
      expect(result.current.filters.accountHqRevenueRange).toEqual([0, 2_000_000])
      rerender({ serverRanges: { ...RANGES, revenue: { min: 0, max: 5_000_000 } } })
      expect(result.current.filters.accountHqRevenueRange).toEqual([0, 2_000_000])
    })

    it("keeps the revenue range of a filter loaded in the same batch as the limits", () => {
      const { result, rerender } = setupBeforeLimits()
      act(() => {
        result.current.handleLoadSavedFilters(
          linkFilters(result, { accountHqRevenueRange: [100, 700], accountYearsInIndiaRange: [2, 3] }),
          { clampRanges: false }
        )
        rerender({ serverRanges: RANGES })
      })
      expect(result.current.filters.accountHqRevenueRange).toEqual([100, 700])
      expect(result.current.filters.accountYearsInIndiaRange).toEqual([2, 3])
    })
  })

  describe("filter_changed tracking", () => {
    // The sliders move from their placeholders to the server's bounds once the
    // facets load. That is not a filter change by the user.
    it("does not report the sliders settling on the server bounds", () => {
      setup()
      flushTracking()
      expect(events("filter_changed")).toHaveLength(0)
    })

    it("does not report new bounds arriving, even with a user change in the same batch", () => {
      const { result, rerender } = setup()
      settle()
      rerender({ serverRanges: { ...RANGES, centerIncYear: { min: 1985, max: 2031 } } })
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune")] }))
      flushTracking()
      expect(events("filter_changed").map((e) => (e as { filter_key: string }).filter_key)).toEqual(["centerCityValues"])
    })

    it("still reports a range the user narrows or widens back", () => {
      const { result } = setup()
      settle()
      act(() => result.current.handleCenterIncYearRangeChange([2000, 2030]))
      flushTracking()
      act(() => result.current.handleCenterIncYearRangeChange([1990, 2030]))
      flushTracking()
      expect(events("filter_changed")).toMatchObject([
        { filter_key: "centerIncYearRange", range_min: 2000, previous_range_min: 1990, active_filters_count: 1 },
        { filter_key: "centerIncYearRange", range_min: 1990, previous_range_min: 2000, active_filters_count: 0 },
      ])
    })

    it("reports a multi-select change with every detail, after a pause", () => {
      const { result } = setup()
      settle()
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune"), exc("Delhi")] }))
      act(() => vi.advanceTimersByTime(349))
      expect(events("filter_changed")).toHaveLength(0)
      act(() => vi.advanceTimersByTime(1))
      expect(events("filter_changed")).toEqual([
        {
          filter_key: "centerCityValues",
          filter_name: "City",
          filter_group: "center",
          filter_input_type: "multi_select",
          change_type: "add",
          include_count: 1,
          exclude_count: 1,
          selected_count: 2,
          previous_selected_count: 0,
          added_count: 2,
          removed_count: 0,
          selected_values: ["Pune", "Delhi"],
          selected_values_with_mode: ["include:Pune", "exclude:Delhi"],
          previous_selected_values: [],
          previous_selected_values_with_mode: [],
          include_values: ["Pune"],
          exclude_values: ["Delhi"],
          previous_include_values: [],
          previous_exclude_values: [],
          added_values: ["exclude:Delhi", "include:Pune"],
          removed_values: [],
          active_filters_count: 1,
        },
      ])
    })

    it("reports removals and clears", () => {
      const { result } = setup()
      settle()
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune"), inc("Delhi")] }))
      settle()
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune")] }))
      flushTracking()
      expect(events("filter_changed")[0]).toMatchObject({ change_type: "remove", removed_values: ["include:Delhi"] })
      change(result, (f) => ({ ...f, centerCityValues: [] }))
      flushTracking()
      expect(events("filter_changed")[1]).toMatchObject({ change_type: "clear", active_filters_count: 0 })
    })

    it("reports range, toggle and select changes", () => {
      const { result } = setup()
      settle()
      change(result, (f) => ({
        ...f,
        accountHqRevenueRange: [10, 900],
        accountHqRevenueIncludeNull: false,
        accountVisibilityMode: "all",
      }))
      flushTracking()
      const byKey = Object.fromEntries((events("filter_changed") as Array<Record<string, unknown>>).map((e) => [e.filter_key, e]))
      expect(byKey.accountHqRevenueRange).toMatchObject({
        change_type: "range_change",
        range_min: 10,
        range_max: 900,
        previous_range_min: 1,
        previous_range_max: 1000,
        range_delta_min: 9,
        range_delta_max: -100,
        // The revenue range and its toggle are one field; visibility is the other.
        active_filters_count: 2,
      })
      expect(byKey.accountHqRevenueIncludeNull).toMatchObject({
        change_type: "toggle",
        null_toggle_value: false,
        previous_null_toggle_value: true,
      })
      expect(byKey.accountVisibilityMode).toMatchObject({
        change_type: "select",
        selected_value: "all",
        previous_selected_value: "gcc",
      })
    })

    it("reports one batch for quick successive changes", () => {
      const { result } = setup()
      settle()
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune")] }))
      act(() => vi.advanceTimersByTime(200))
      change(result, (f) => ({ ...f, centerCityValues: [inc("Pune"), inc("Goa")] }))
      flushTracking()
      expect(events("filter_changed")).toHaveLength(1)
      expect(events("filter_changed")[0]).toMatchObject({ selected_count: 2, previous_selected_count: 0 })
    })
  })
})
