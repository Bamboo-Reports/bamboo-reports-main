// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { notifyManager } from "@tanstack/react-query"
import type { Filters } from "@/lib/types"

// Every api-client fetch returns a promise the test settles by hand, so the
// order in which responses land can be controlled exactly. Like fetch, a call
// rejects with an AbortError once its signal is aborted.
type Call = { kind: string; signal?: AbortSignal; resolve: (value: unknown) => void; reject: (err: Error) => void }
const calls: Call[] = []
const captured = vi.hoisted(() => ({ events: [] as string[] }))

vi.mock("@/lib/analytics/client", () => ({ captureEvent: (event: string) => captured.events.push(event) }))
vi.mock("@/lib/dashboard/api-client", () => {
  type Opts = { signal?: AbortSignal } | undefined
  const deferred = (kind: string, opts: Opts) =>
    new Promise((resolve, reject) => {
      const signal = opts?.signal
      calls.push({ kind, signal, resolve, reject })
      signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
    })
  return {
    clearAccountRelatedCache: () => {},
    isAbortError: (err: unknown) => (err as { name?: unknown } | null)?.name === "AbortError",
    fetchDashboardSummary: (_f: unknown, opts: Opts) => deferred("summary", opts),
    fetchDashboardFacets: (_f: unknown, opts: Opts) => deferred("facets", opts),
    fetchDashboardCharts: (_f: unknown, opts: Opts) => deferred("charts", opts),
    fetchCentersMap: (_f: unknown, opts: Opts) => deferred("map", opts),
    fetchEntityPage: (entity: string, _f: unknown, _p: unknown, _s: unknown, _o: unknown, opts: Opts) =>
      deferred(`page:${entity}`, opts),
  }
})

import { clearClientDashboardCache, useServerDashboardData, type DashboardViews } from "@/hooks/use-server-dashboard-data"
import type { EntitySort } from "@/lib/dashboard/api-client"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { createQueryWrapper } from "../fixtures/query-client"

const summary = (accounts: number) => ({
  filtered: { accounts, centers: 0, upcomingCenters: 0, prospects: 0, headcount: 0, services: 0 },
  full: { accounts: 999, centers: 0, upcomingCenters: 0, prospects: 0, headcount: 0, services: 0 },
})
const facets = {
  options: {},
  ranges: { revenue: { min: 0, max: 10 }, yearsInIndia: { min: 0, max: 10 }, centerIncYear: { min: 0, max: 10 } },
}
const page = (marker: string) => ({ rows: [{ marker }], total: 1, page: 1, pageSize: 51 })

type Props = {
  filters: Filters
  views?: DashboardViews
  accountsSort?: EntitySort | null
  accountsPage?: number
}

function props({ filters, views, accountsSort = null, accountsPage = 1 }: Props) {
  return {
    enabled: true,
    filters,
    pages: { accounts: accountsPage, centers: 1, prospects: 1 },
    sorts: { accounts: accountsSort, centers: null, prospects: null },
    pageSize: 51,
    views: views ?? { needCharts: false, needMap: false, activeEntity: "accounts" as const },
  }
}

const pendingCalls = (kind: string) => calls.filter((c) => c.kind === kind)
const latest = (kind: string) => {
  const call = pendingCalls(kind).at(-1)
  if (!call) throw new Error(`no ${kind} request was made`)
  return call
}

const base = createDefaultFilters()
const withRegion = { ...base, accountHqRegionValues: [{ value: "APAC", mode: "include" as const }] }

async function settle() {
  await act(async () => {})
}

/** Render with the base filters and let the first summary + facets + page land. */
async function renderLoaded(initial: Props = { filters: base }) {
  const hook = renderHook((p: Props) => useServerDashboardData(props(p)), { wrapper: createQueryWrapper(), initialProps: initial })
  await act(async () => {
    latest("summary").resolve(summary(100))
    latest("facets").resolve(facets)
    latest("page:accounts").resolve(page("base"))
  })
  expect(hook.result.current.pending.summary).toBe(false)
  return hook
}

// TanStack Query batches its updates on a timer, which fake timers would hold
// back; deliver them as microtasks so each act() sees them (the scheduler the
// TanStack docs give for this).
beforeAll(() => {
  notifyManager.setScheduler(queueMicrotask)
})

afterAll(() => {
  notifyManager.setScheduler((cb) => setTimeout(cb, 0))
})

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  captured.events.length = 0
  clearClientDashboardCache()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useServerDashboardData: returning to a cached state while a request is in flight", () => {
  it("ignores the late summary/facets response and does not stay pending", async () => {
    const { result, rerender } = await renderLoaded()

    // Add a filter: after the debounce, its requests go out.
    rerender({ filters: withRegion })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const lateSummary = latest("summary")
    const lateFacets = latest("facets")

    // Remove it again before they return: the base state is cached and applies at once.
    rerender({ filters: base })
    await settle()
    expect(result.current.summary?.filtered.accounts).toBe(100)

    // The responses for the removed filter land late.
    await act(async () => {
      lateSummary.resolve(summary(7))
      lateFacets.resolve(facets)
    })

    expect(result.current.summary?.filtered.accounts).toBe(100)
    expect(result.current.pending.summary).toBe(false)
    expect(result.current.pending.facets).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it("ignores a late table page after the sort goes back to a cached one", async () => {
    const { result, rerender } = await renderLoaded()

    rerender({ filters: base, accountsSort: { column: "name", direction: "asc" } })
    await settle()
    const lateAsc = latest("page:accounts")

    // Back to unsorted, which is cached.
    rerender({ filters: base, accountsSort: null })
    await settle()
    expect(result.current.entityPages.accounts).toEqual(page("base"))

    await act(async () => {
      lateAsc.resolve(page("asc"))
    })

    expect(result.current.entityPages.accounts).toEqual(page("base"))
    expect(result.current.pending.accounts).toBe(false)
  })

  it("ignores a late map response after returning to a cached state", async () => {
    const mapViews = { needCharts: false, needMap: true, activeEntity: "accounts" as const }
    const hook = renderHook((p: Props) => useServerDashboardData(props(p)), {
      wrapper: createQueryWrapper(),
    initialProps: { filters: base, views: mapViews },
    })
    // First map call is the unfiltered colour-scale request; the filtered one follows.
    await act(async () => {
      latest("summary").resolve(summary(100))
      latest("facets").resolve(facets)
      latest("page:accounts").resolve(page("base"))
      for (const call of pendingCalls("map")) call.resolve({ states: [], cities: [], marker: "base" })
    })
    const { result, rerender } = hook
    expect(result.current.pending.map).toBe(false)

    rerender({ filters: withRegion, views: mapViews })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const lateMap = latest("map")

    rerender({ filters: base, views: mapViews })
    await settle()

    await act(async () => {
      lateMap.resolve({ states: [], cities: [], marker: "region" })
    })

    expect(result.current.map).toMatchObject({ marker: "base" })
    expect(result.current.pending.map).toBe(false)
  })
})

describe("useServerDashboardData: failures after the first load", () => {
  it("stops pending and reports the error when summary fails", async () => {
    const { result, rerender } = await renderLoaded()
    const seqBefore = result.current.failure?.seq ?? 0

    rerender({ filters: withRegion })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      latest("summary").reject(new Error("Request failed (504)"))
      latest("facets").resolve(facets)
    })

    expect(result.current.pending.summary).toBe(false)
    expect(result.current.pending.core).toBe(false)
    expect(result.current.isFetching).toBe(false)
    expect(result.current.failure).toEqual({ message: "Request failed (504)", seq: seqBefore + 1 })
  })

  it("keeps the previous data on screen when a newer state fails", async () => {
    const { result, rerender } = await renderLoaded()

    rerender({ filters: withRegion })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await act(async () => {
      latest("summary").reject(new Error("Request failed (504)"))
      latest("facets").resolve(facets)
      latest("page:accounts").reject(new Error("Request failed (504)"))
    })

    expect(result.current.summary?.filtered.accounts).toBe(100)
    expect(result.current.entityPages.accounts).toEqual(page("base"))
  })

  it("stops pending and reports the error when a table page fails", async () => {
    const { result, rerender } = await renderLoaded()

    rerender({ filters: base, accountsSort: { column: "name", direction: "asc" } })
    await settle()
    await act(async () => {
      latest("page:accounts").reject(new Error("Request failed (500)"))
    })

    expect(result.current.pending.accounts).toBe(false)
    expect(result.current.failure?.message).toBe("Request failed (500)")
  })

  it("stops pending and reports the error when charts fail", async () => {
    const chartViews = { needCharts: true, needMap: false, activeEntity: "accounts" as const }
    const { result } = renderHook((p: Props) => useServerDashboardData(props(p)), {
      wrapper: createQueryWrapper(),
      initialProps: { filters: base, views: chartViews },
    })
    await act(async () => {
      latest("summary").resolve(summary(100))
      latest("facets").resolve(facets)
      latest("page:accounts").resolve(page("base"))
      latest("charts").reject(new Error("Too many requests"))
    })

    expect(result.current.pending.charts).toBe(false)
    expect(result.current.failure?.message).toBe("Too many requests")
  })
})

describe("useServerDashboardData: cancelling superseded requests", () => {
  it("aborts the previous filter state's requests, including prefetches, without reporting an error", async () => {
    const { result, rerender } = await renderLoaded()
    const before = calls.length

    rerender({ filters: withRegion })
    await act(async () => {
      vi.advanceTimersByTime(400) // debounce, then the visible requests
    })
    await act(async () => {
      vi.advanceTimersByTime(400) // background prefetch
    })
    // Everything still in flight for the APAC state.
    const superseded = calls.slice(before).filter((c) => c.signal && !c.signal.aborted)
    expect(superseded.map((c) => c.kind).sort()).toEqual(
      ["charts", "facets", "map", "page:accounts", "page:centers", "page:prospects", "summary"].sort()
    )

    rerender({ filters: { ...base, accountHqRegionValues: [{ value: "EMEA", mode: "include" as const }] } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(superseded.every((c) => c.signal?.aborted)).toBe(true)
    expect(latest("summary").signal?.aborted).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.failure).toBeNull()
    expect(captured.events).not.toContain("data_load_failed")
  })

  it("aborts a table's previous page request when its sort changes, leaving the core requests alone", async () => {
    const { result, rerender } = await renderLoaded()

    rerender({ filters: base, accountsSort: { column: "name", direction: "asc" } })
    await settle()
    const asc = latest("page:accounts")

    rerender({ filters: base, accountsSort: { column: "name", direction: "desc" } })
    await settle()

    expect(asc.signal?.aborted).toBe(true)
    expect(latest("page:accounts").signal?.aborted).toBe(false)
    expect(result.current.failure).toBeNull()
  })

  it("does not report an aborted chart request after the chart view was closed", async () => {
    const chartViews = { needCharts: true, needMap: false, activeEntity: "accounts" as const }
    const tableViews = { needCharts: false, needMap: false, activeEntity: "accounts" as const }
    const { result, rerender } = await renderLoaded({ filters: base, views: chartViews })
    const charts = latest("charts")

    // Close the chart view while its request is in flight, then change the filters.
    rerender({ filters: base, views: tableViews })
    rerender({ filters: withRegion, views: tableViews })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(charts.signal?.aborted).toBe(true)
    expect(result.current.failure).toBeNull()
  })

  it("aborts everything in flight on unmount", async () => {
    const { unmount } = renderHook((p: Props) => useServerDashboardData(props(p)), { wrapper: createQueryWrapper(), initialProps: { filters: base } })
    const inFlight = calls.filter((c) => c.signal)
    expect(inFlight.map((c) => c.kind).sort()).toEqual(["facets", "page:accounts", "summary"])

    unmount()

    expect(inFlight.every((c) => c.signal?.aborted)).toBe(true)
    expect(captured.events).not.toContain("data_load_failed")
  })
})

describe("useServerDashboardData: filter change on a later page (#289)", () => {
  it("does not fetch page 1 for the old filters while the new filters are debouncing", async () => {
    const { result, rerender } = await renderLoaded()

    rerender({ filters: base, accountsPage: 2 })
    await settle()
    await act(async () => {
      latest("page:accounts").resolve(page("base-p2"))
    })
    const before = pendingCalls("page:accounts").length

    // The dashboard resets to page 1 in the same update as the filter change.
    rerender({ filters: withRegion, accountsPage: 1 })
    await settle()
    expect(pendingCalls("page:accounts")).toHaveLength(before)
    expect(result.current.entityPages.accounts).toEqual(page("base-p2"))

    // Once the debounce applies the new filters, page 1 is fetched once, for them.
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(pendingCalls("page:accounts")).toHaveLength(before + 1)
    await act(async () => {
      latest("page:accounts").resolve(page("region-p1"))
    })
    expect(result.current.entityPages.accounts).toEqual(page("region-p1"))
    expect(result.current.pending.accounts).toBe(false)
  })

  it("still fetches a page change right away when the filters are settled", async () => {
    const { rerender } = await renderLoaded()
    const before = pendingCalls("page:accounts").length

    rerender({ filters: base, accountsPage: 2 })
    await settle()

    expect(pendingCalls("page:accounts")).toHaveLength(before + 1)
  })
})

describe("useServerDashboardData: map colour scale retries (#291)", () => {
  const mapViews = { needCharts: false, needMap: true, activeEntity: "accounts" as const }

  it("retries the colour scale after a failure instead of giving up for the session", async () => {
    const { result } = renderHook((p: Props) => useServerDashboardData(props(p)), {
      wrapper: createQueryWrapper(),
    initialProps: { filters: base, views: mapViews },
    })
    const [scale, filtered] = pendingCalls("map")
    await act(async () => {
      latest("summary").resolve(summary(100))
      latest("facets").resolve(facets)
      latest("page:accounts").resolve(page("base"))
      filtered.resolve({ states: [], cities: [] })
      scale.reject(new Error("Request failed (504)"))
    })
    expect(result.current.scaleStates).toBeNull()
    const callsAfterFailure = pendingCalls("map").length

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(pendingCalls("map").length).toBe(callsAfterFailure + 1)

    await act(async () => {
      latest("map").resolve({ states: [{ stateKey: "ka" }], cities: [] })
    })
    expect(result.current.scaleStates).toEqual([{ stateKey: "ka" }])
  })

  it("retries the colour scale on refresh after the automatic retries are used up", async () => {
    const { result } = renderHook((p: Props) => useServerDashboardData(props(p)), {
      wrapper: createQueryWrapper(),
    initialProps: { filters: base, views: mapViews },
    })
    const [scale, filtered] = pendingCalls("map")
    await act(async () => {
      latest("summary").resolve(summary(100))
      latest("facets").resolve(facets)
      latest("page:accounts").resolve(page("base"))
      filtered.resolve({ states: [], cities: [] })
      scale.reject(new Error("Request failed (504)"))
    })
    // Fail every automatic retry.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      await act(async () => {
        latest("map").reject(new Error("Request failed (504)"))
      })
    }
    const exhausted = pendingCalls("map").length
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    expect(pendingCalls("map").length).toBe(exhausted)

    await act(async () => {
      result.current.reload()
    })
    // Answer every map request the refresh sent; only a colour-scale request sets scaleStates.
    await act(async () => {
      for (const call of pendingCalls("map").slice(exhausted)) call.resolve({ states: [{ stateKey: "ka" }], cities: [] })
    })
    expect(result.current.scaleStates).toEqual([{ stateKey: "ka" }])
  })
})
