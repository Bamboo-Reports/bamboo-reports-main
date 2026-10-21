// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Filters } from "@/lib/types"

// Every api-client fetch returns a promise the test settles by hand, so the
// order in which responses land can be controlled exactly.
type Call = { kind: string; resolve: (value: unknown) => void; reject: (err: Error) => void }
const calls: Call[] = []

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))
vi.mock("@/lib/dashboard/api-client", () => {
  const deferred = (kind: string) =>
    new Promise((resolve, reject) => {
      calls.push({ kind, resolve, reject })
    })
  return {
    clearAccountRelatedCache: () => {},
    fetchDashboardSummary: () => deferred("summary"),
    fetchDashboardFacets: () => deferred("facets"),
    fetchDashboardCharts: () => deferred("charts"),
    fetchCentersMap: () => deferred("map"),
    fetchEntityPage: (entity: string) => deferred(`page:${entity}`),
  }
})

import { clearClientDashboardCache, useServerDashboardData, type DashboardViews } from "@/hooks/use-server-dashboard-data"
import type { EntitySort } from "@/lib/dashboard/api-client"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

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
}

function props({ filters, views, accountsSort = null }: Props) {
  return {
    enabled: true,
    filters,
    pages: { accounts: 1, centers: 1, prospects: 1 },
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
  const hook = renderHook((p: Props) => useServerDashboardData(props(p)), { initialProps: initial })
  await act(async () => {
    latest("summary").resolve(summary(100))
    latest("facets").resolve(facets)
    latest("page:accounts").resolve(page("base"))
  })
  expect(hook.result.current.pending.summary).toBe(false)
  return hook
}

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
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
