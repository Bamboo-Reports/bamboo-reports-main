// @vitest-environment jsdom
import { useState } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Filters } from "@/lib/types"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

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
function Harness() {
  const [filters, setFilters] = useState<Filters>(createDefaultFilters())
  return (
    <>
      <SavedFiltersManager
        currentFilters={filters}
        onLoadFilters={(next) => setFilters({ ...next })}
        totalActiveFilters={1}
      />
      <button type="button" onClick={() => setFilters((f) => ({ ...f, accountHqCountryValues: [] }))}>
        edit filters
      </button>
    </>
  )
}

const trigger = () => screen.getByRole("button", { name: /saved filters|q4 bfsi gccs/i })

describe("saved filters trigger label", () => {
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
})
