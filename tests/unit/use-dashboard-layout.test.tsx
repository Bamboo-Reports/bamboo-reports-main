// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { captureEvent } from "@/lib/analytics/client"
import {
  PAGE_SIZE_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  useDashboardLayout,
} from "@/hooks/use-dashboard-layout"
import { makeSortHandler } from "@/hooks/use-entity-table-props"
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/dashboard/page-size"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))

beforeEach(() => {
  vi.mocked(captureEvent).mockClear()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const setup = (filtersKey = "a") =>
  renderHook(({ key }) => useDashboardLayout({ filtersKey: key }), { initialProps: { key: filtersKey } })

// A size the footer offers that is not the default, so the tests can tell a
// restored size from the one the hook starts on.
const OTHER_PAGE_SIZE = PAGE_SIZE_OPTIONS.find((size) => size !== DEFAULT_PAGE_SIZE)!

describe("useDashboardLayout", () => {
  it("starts on the accounts map with page 1 everywhere", () => {
    const { result } = setup()
    expect(result.current.activeSection).toBe("accounts")
    expect(result.current.activeView).toBe("map")
    expect(result.current.hasMapView).toBe(true)
    expect(result.current.activePage).toBe(1)
    expect(result.current.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
  })

  it("follows the active section's view and page", () => {
    const { result } = setup()
    act(() => {
      result.current.setCentersView("data")
      result.current.setCentersPage(3)
      result.current.setActiveSection("centers")
    })
    expect(result.current.activeView).toBe("data")
    expect(result.current.activePage).toBe(3)
    expect(result.current.hasMapView).toBe(false)
    act(() => result.current.setActiveSection("prospects"))
    expect(result.current.activeView).toBe("chart")
    expect(result.current.hasMapView).toBe(false)
  })

  it("a new page size resets every page and is remembered", () => {
    const { result } = setup()
    act(() => {
      result.current.setAccountsPage(2)
      result.current.setCentersPage(4)
      result.current.setProspectsPage(5)
    })
    act(() => result.current.setItemsPerPage(OTHER_PAGE_SIZE))
    expect(result.current.itemsPerPage).toBe(OTHER_PAGE_SIZE)
    expect([result.current.accountsPage, result.current.centersPage, result.current.prospectsPage]).toEqual([1, 1, 1])
    expect(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe(String(OTHER_PAGE_SIZE))
  })

  it("restores a saved page size on the first render and ignores sizes the tables do not offer", () => {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(OTHER_PAGE_SIZE))
    const seen: number[] = []
    const { result } = renderHook(() => {
      const layout = useDashboardLayout({ filtersKey: "a" })
      seen.push(layout.itemsPerPage)
      return layout
    })
    // The first render already has it, so the first page query is not sent at the default size.
    expect(seen[0]).toBe(OTHER_PAGE_SIZE)
    expect(result.current.itemsPerPage).toBe(OTHER_PAGE_SIZE)
    cleanup()
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, "7")
    expect(setup().result.current.itemsPerPage).toBe(DEFAULT_PAGE_SIZE)
  })

  it("goes back to page 1 when the filters change", () => {
    const { result, rerender } = setup("a")
    act(() => {
      result.current.setAccountsPage(2)
      result.current.setCentersPage(3)
    })
    rerender({ key: "a" })
    expect(result.current.accountsPage).toBe(2)
    rerender({ key: "b" })
    expect([result.current.accountsPage, result.current.centersPage]).toEqual([1, 1])
  })

  it("remembers the sidebar and reports toggles, not the initial state", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true")
    const { result } = setup()
    expect(result.current.isSidebarCollapsed).toBe(true)
    expect(captureEvent).not.toHaveBeenCalled()
    act(() => result.current.toggleSidebar())
    expect(result.current.isSidebarCollapsed).toBe(false)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false")
    expect(captureEvent).toHaveBeenCalledWith("sidebar_toggled", { is_collapsed: false })
  })

  it("maps tab sort keys to server columns and drops unknown ones", () => {
    const { result } = setup()
    act(() => result.current.setAccountsSort({ key: "industry", direction: "desc" }))
    expect(result.current.entitySorts.accounts).toEqual({ column: "account_hq_industry", direction: "desc" })
    act(() => result.current.setAccountsSort({ key: "not-a-column", direction: "asc" }))
    expect(result.current.entitySorts.accounts).toBeNull()
  })
})

describe("makeSortHandler", () => {
  it("sets sortable columns and clears on unknown columns or no direction", () => {
    const set = vi.fn()
    const handle = makeSortHandler("accounts", set)
    handle("name", "asc")
    expect(set).toHaveBeenLastCalledWith({ key: "name", direction: "asc" })
    handle("name", null)
    expect(set).toHaveBeenLastCalledWith(null)
    handle("unknown", "desc")
    expect(set).toHaveBeenLastCalledWith(null)
  })
})
