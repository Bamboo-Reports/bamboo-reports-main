// @vitest-environment jsdom
import { useMemo, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import { useDashboardUrlSync } from "@/hooks/use-dashboard-url-sync"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { DEFAULT_URL_VIEWS, decodeDashboardUrl, encodeDashboardUrl, type UrlSection, type UrlView } from "@/lib/dashboard/url-state"
import type { Filters, FilterValue } from "@/lib/types"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))

const lists = vi.hoisted(() => ({ value: { lists: [] as unknown[], loaded: false, loadFailed: false } }))
vi.mock("@/contexts/account-lists-context", () => ({ useAccountLists: () => lists.value }))

const toastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { error: toastError } }))

const RANGES = {
  revenue: { min: 1, max: 1000 },
  yearsInIndia: { min: 1, max: 50 },
  centerIncYear: { min: 1990, max: 2030 },
}
type Ranges = typeof RANGES
const EMPTY: never[] = []
const inc = (value: string): FilterValue => ({ value, mode: "include" })

/** The filters and address-bar hooks wired the way the dashboard page wires them. */
function useWired({ serverRanges }: { serverRanges: Ranges | null }) {
  const filters = useDashboardFilters({
    accounts: EMPTY, centers: EMPTY, functions: EMPTY, services: EMPTY, prospects: EMPTY, tech: EMPTY,
    serverRanges: serverRanges ?? undefined,
  })
  const [section, setSection] = useState<UrlSection>("accounts")
  const [view, setView] = useState<UrlView>(DEFAULT_URL_VIEWS.accounts)
  const bounds = useMemo(
    () => ({ revenue: filters.revenueRange, yearsInIndia: filters.yearsInIndiaRange, centerIncYear: filters.centerIncYearRange }),
    [filters.revenueRange, filters.yearsInIndiaRange, filters.centerIncYearRange]
  )
  const sync = useDashboardUrlSync({
    filters: filters.filters,
    bounds,
    boundsKnown: serverRanges !== null,
    applyFilters: filters.handleLoadSavedFilters,
    section,
    setSection,
    view,
    setView: (_section, next) => setView(next),
  })
  return { ...sync, filters: filters.filters }
}

/** A link to the given filters, as the dashboard would write it with the real limits known. */
const linkTo = (overrides: Partial<Filters>) =>
  encodeDashboardUrl(
    {
      section: "accounts",
      view: DEFAULT_URL_VIEWS.accounts,
      filters: createDefaultFilters({
        accountHqRevenueRange: [1, 1000],
        accountYearsInIndiaRange: [1, 50],
        centerIncYearRange: [1990, 2030],
        ...overrides,
      }),
    },
    RANGES
  )

const open = (search: string) => {
  window.history.replaceState(null, "", `/${search}`)
  const written: string[] = []
  const spy = vi.spyOn(window.history, "replaceState").mockImplementation((_state, _title, url) => {
    written.push(String(url))
  })
  const hook = renderHook((props: { serverRanges: Ranges | null }) => useWired(props), { initialProps: { serverRanges: null as Ranges | null } })
  return { ...hook, written, spy }
}

beforeEach(() => {
  vi.useFakeTimers()
  lists.value = { lists: [], loaded: false, loadFailed: false }
  toastError.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.history.replaceState(null, "", "/")
})

describe("useDashboardUrlSync with the filters hook", () => {
  it("applies a link's filters at once, before the data's limits arrive", () => {
    const { result } = open(linkTo({ accountHqRevenueRange: [100, 700], centerCityValues: [inc("Pune")] }))
    expect(result.current.filtersRestored).toBe(true)
    expect(result.current.filters.centerCityValues).toEqual([inc("Pune")])
    expect(result.current.filters.accountHqRevenueRange).toEqual([100, 700])
  })

  it("keeps the link's range and never writes placeholder ranges to the address when the limits arrive", () => {
    const { result, rerender, written } = open(linkTo({ accountHqRevenueRange: [100, 700] }))
    rerender({ serverRanges: RANGES })
    expect(result.current.filters.accountHqRevenueRange).toEqual([100, 700])
    expect(result.current.filters.accountYearsInIndiaRange).toEqual([1, 50])
    for (const url of written) {
      const diff = decodeDashboardUrl(new URL(url, "https://example.test").search).filters ?? {}
      expect(Object.keys(diff)).toEqual(["accountHqRevenueRange"])
    }
  })

  it("leaves a plain address alone when the limits arrive", () => {
    const { rerender, written } = open("")
    rerender({ serverRanges: RANGES })
    expect(written.every((url) => !url.includes("f="))).toBe(true)
  })

  it("stops waiting for a list as soon as the lists have loaded without it", () => {
    const { result, rerender } = open(linkTo({ accountListValues: [inc("someone-elses-list")], accountNameValues: [inc("Acme Corp")] }))
    expect(result.current.filtersRestored).toBe(false)

    lists.value = { lists: [], loaded: true, loadFailed: false }
    rerender({ serverRanges: null })
    expect(result.current.filtersRestored).toBe(true)
    expect(result.current.filters.accountNameValues).toEqual([inc("Acme Corp")])
  })

  it("gives up on lists that never load after four seconds", () => {
    const { result } = open(linkTo({ accountListValues: [inc("someone-elses-list")], accountNameValues: [inc("Acme Corp")] }))
    act(() => void vi.advanceTimersByTime(3900))
    expect(result.current.filtersRestored).toBe(false)
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current.filtersRestored).toBe(true)
  })

  describe("a link that names a list without its accounts (too long to carry them)", () => {
    const listLink = () => linkTo({ accountListValues: [inc("big-list")] })
    const bigList = { id: "big-list", name: "Big list", accounts: ["Acme Corp", "Globex"] }

    it("drops a list that is not shared, and says so", () => {
      lists.value = { lists: [], loaded: true, loadFailed: false }
      const { result } = open(listLink())
      expect(result.current.filtersRestored).toBe(true)
      expect(result.current.filters.accountListValues).toEqual([])
      expect(result.current.filters.accountNameValues).toEqual([])
      expect(toastError).toHaveBeenCalledWith("Could not apply an account list", {
        description: "The link's list is not shared with you",
      })
    })

    it("says the lists did not load, not that the list is not shared, when loading failed", () => {
      lists.value = { lists: [], loaded: true, loadFailed: true }
      const { result } = open(listLink())
      expect(result.current.filters.accountListValues).toEqual([])
      expect(toastError).toHaveBeenCalledWith("Could not apply an account list", {
        description: "Your account lists did not load. Reload the page to try again",
      })
    })

    it("expands the list once it loads after the wait ran out", () => {
      const { result, rerender } = open(listLink())
      act(() => void vi.advanceTimersByTime(4100))
      expect(result.current.filtersRestored).toBe(true)
      expect(result.current.filters.accountNameValues).toEqual([])

      lists.value = { lists: [bigList], loaded: true, loadFailed: false }
      rerender({ serverRanges: null })
      expect(result.current.filters.accountListValues).toEqual([inc("big-list")])
      expect(result.current.filters.accountNameValues).toEqual([inc("Acme Corp"), inc("Globex")])
      expect(toastError).not.toHaveBeenCalled()
    })

    it("drops the list when the lists load late without it", () => {
      const { result, rerender } = open(listLink())
      act(() => void vi.advanceTimersByTime(4100))
      expect(result.current.filters.accountListValues).toEqual([inc("big-list")])

      lists.value = { lists: [], loaded: true, loadFailed: false }
      rerender({ serverRanges: null })
      expect(result.current.filters.accountListValues).toEqual([])
      expect(toastError).toHaveBeenCalledTimes(1)
    })
  })
})
