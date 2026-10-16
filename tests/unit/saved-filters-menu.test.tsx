// @vitest-environment jsdom
import { useState } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { markAutoAdjusted } from "@/hooks/use-dashboard-filters"

const savedFilter = {
  id: "f1",
  name: "Q4 BFSI GCCs",
  filters: createDefaultFilters({ accountHqCountryValues: [{ value: "India", mode: "include" }] }),
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  user_id: "u1",
}

vi.mock("@/hooks/use-saved-filters", () => ({
  useSavedFilters: () => ({
    savedFilters: [savedFilter],
    loading: false,
    userId: "u1",
    saveFilter: vi.fn(),
    deleteFilter: vi.fn(),
    updateFilter: vi.fn(),
    shareFilter: vi.fn(),
    unshareFilter: vi.fn(),
    getFilterShares: vi.fn(async () => []),
  }),
}))
vi.mock("@/contexts/account-lists-context", () => ({
  useAccountLists: () => ({ lists: [], loading: false, createList: vi.fn(), updateList: vi.fn() }),
}))
vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))

import { SavedFiltersManager } from "@/components/filters/saved-filters-manager"

// Mirrors useDashboardFilters: loading replaces the filters with a new object.
function Harness({ active = 1 }: { active?: number }) {
  const [filters, setFilters] = useState<Filters>(createDefaultFilters())
  return (
    <>
      <SavedFiltersManager
        currentFilters={filters}
        onLoadFilters={(next) => {
          const applied = { ...next }
          setFilters(applied)
          return applied
        }}
        totalActiveFilters={active}
      />
      <button type="button" onClick={() => setFilters((f) => ({ ...f, accountHqCountryValues: [] }))}>
        edit filters
      </button>
      {/* Mirrors the hook narrowing the revenue range after new server ranges arrive. */}
      <button
        type="button"
        onClick={() =>
          setFilters((f) => markAutoAdjusted(f, { ...f, accountHqRevenueRange: [f.accountHqRevenueRange[0] + 1, f.accountHqRevenueRange[1]] }))
        }
      >
        auto clamp
      </button>
      {/* A user edit and an automatic clamp landing in the same render. */}
      <button
        type="button"
        onClick={() =>
          setFilters((f) => {
            const edited = { ...f, accountHqCountryValues: [] }
            return markAutoAdjusted(edited, { ...edited, accountHqRevenueRange: [edited.accountHqRevenueRange[0] + 1, edited.accountHqRevenueRange[1]] })
          })
        }
      >
        edit then auto clamp
      </button>
    </>
  )
}

const trigger = () => screen.getByRole("button", { name: /saved filters|q4 bfsi gccs/i })

describe("saved filters menu", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => cleanup())

  it("shows the loaded saved filter's name until the filters change", async () => {
    render(<Harness />)
    expect(trigger().textContent).toContain("Saved Filters")

    fireEvent.keyDown(trigger(), { key: "Enter" })
    const item = await screen.findByTitle("Q4 BFSI GCCs")
    await act(async () => fireEvent.click(item))
    expect(trigger().textContent).toContain("Q4 BFSI GCCs")

    await act(async () => fireEvent.click(screen.getByText("edit filters")))
    expect(trigger().textContent).toContain("Saved Filters")
  })

  async function loadSavedFilter() {
    fireEvent.keyDown(trigger(), { key: "Enter" })
    const item = await screen.findByTitle("Q4 BFSI GCCs")
    await act(async () => fireEvent.click(item))
    expect(trigger().textContent).toContain("Q4 BFSI GCCs")
  }

  it("keeps the name through automatic range clamps, then clears on a user edit", async () => {
    render(<Harness />)
    await loadSavedFilter()

    await act(async () => fireEvent.click(screen.getByText("auto clamp")))
    await act(async () => fireEvent.click(screen.getByText("auto clamp")))
    expect(trigger().textContent).toContain("Q4 BFSI GCCs")

    await act(async () => fireEvent.click(screen.getByText("edit filters")))
    expect(trigger().textContent).toContain("Saved Filters")
  })

  it("clears the name when a clamp lands on top of a user edit", async () => {
    render(<Harness />)
    await loadSavedFilter()

    await act(async () => fireEvent.click(screen.getByText("edit then auto clamp")))
    expect(trigger().textContent).toContain("Saved Filters")
  })

  it("loads a saved filter with the keyboard and exposes Share as its own item", async () => {
    render(<Harness />)
    fireEvent.keyDown(trigger(), { key: "Enter" })
    const item = await screen.findByTitle("Q4 BFSI GCCs")
    expect(item.getAttribute("role")).toBe("menuitem")
    expect(screen.getByRole("menuitem", { name: "Share saved filter Q4 BFSI GCCs" })).toBeTruthy()

    await act(async () => fireEvent.keyDown(item, { key: "Enter" }))
    expect(trigger().textContent).toContain("Q4 BFSI GCCs")
  })

  it("keeps Save focusable and explains why it is unavailable with no filters", () => {
    render(<Harness active={0} />)
    const save = screen.getByRole("button", { name: "Save current filters (apply a filter first)" })
    expect(save.getAttribute("aria-disabled")).toBe("true")
    expect(save.hasAttribute("disabled")).toBe(false)
    expect(save.getAttribute("title")).toBe("Apply a filter to save")
    fireEvent.click(save)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
