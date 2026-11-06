// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render as rtlRender, fireEvent, cleanup, act } from "@testing-library/react"
import type { ReactElement } from "react"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { NUMBER_FORMAT_STORAGE_KEY } from "@/hooks/use-number-format-preference"

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}))

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: TooltipProvider })

/** Focuses a figure and returns the text of the tooltip it opens, or null when none opens. */
function tooltipFor(el: HTMLElement): string | null {
  act(() => { fireEvent.focus(el) })
  const text = document.querySelector('[role="tooltip"]')?.textContent ?? null
  act(() => { fireEvent.blur(el) })
  return text
}

describe("summary-cards", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it("renders the summary cards and handles click events on enabled sections", () => {
    const onSelect = vi.fn()
    
    const { getByText } = render(
      <SummaryCards
        filteredAccountsCount={10}
        totalAccountsCount={20}
        filteredCentersCount={5}
        totalCentersCount={10}
        filteredUpcomingCentersCount={1}
        totalUpcomingCentersCount={2}
        filteredProspectsCount={50}
        totalProspectsCount={100}
        filteredHeadcount={1500000} // Test >1M compact formatting
        totalHeadcount={2000000}
        activeView="accounts"
        onSelect={onSelect}
      />
    )

    const accountsCard = getByText("Accounts").closest(".rounded-xl")
    expect(accountsCard).not.toBeNull()
    if (accountsCard) fireEvent.click(accountsCard)
    expect(onSelect).toHaveBeenCalledWith("accounts")

    // Test keyboard events
    if (accountsCard) fireEvent.keyDown(accountsCard, { key: "Enter" })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it("shows a new count immediately without animating", () => {
    const props = {
      filteredAccountsCount: 10,
      totalAccountsCount: 20,
      filteredCentersCount: 5,
      totalCentersCount: 10,
      filteredUpcomingCentersCount: 1,
      totalUpcomingCentersCount: 2,
      filteredProspectsCount: 50,
      totalProspectsCount: 100,
      filteredHeadcount: 5000,
      totalHeadcount: 8000,
      activeView: "accounts" as const,
      onSelect: vi.fn(),
    }

    const { getByText, rerender } = render(<SummaryCards {...props} />)
    rerender(<SummaryCards {...props} filteredProspectsCount={37} />)

    const value = getByText("37")
    expect(value.className).not.toContain("animate-")
  })

  it("shortens only the figures that do not fit their own card", () => {
    // Fake layout: every card row is 150px wide and text is 10px per character.
    // Measure copies carry their text in data-text, so width comes from that.
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(150)
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const text = Array.from(this.querySelectorAll<HTMLElement>("[data-text]"))
        .map((el) => el.dataset.text)
        .join(" ")
      return { width: text.length * 10 } as DOMRect
    })

    try {
      const { getByText, queryByText } = render(
        <SummaryCards
          filteredAccountsCount={10}
          totalAccountsCount={20}
          filteredCentersCount={5}
          totalCentersCount={10}
          filteredUpcomingCentersCount={1}
          totalUpcomingCentersCount={2}
          filteredProspectsCount={50}
          totalProspectsCount={100}
          filteredHeadcount={1500000}
          totalHeadcount={2000000}
          activeView="accounts"
          onSelect={vi.fn()}
        />
      )

      // "1,500,000 of 2,000,000" is too wide, "1,500,000 of 2M" fits: only the total shortens.
      // Expected strings use toLocaleString, matching the component, so any locale passes.
      expect(tooltipFor(getByText((1500000).toLocaleString()))).toBeNull()
      expect(tooltipFor(getByText("of 2M"))).toBe(`of ${(2000000).toLocaleString()}`)
      expect(queryByText(`of ${(2000000).toLocaleString()}`)).toBeNull()
      // Short figures on the other cards stay exact.
      expect(getByText("of 20")).not.toBeNull()
    } finally {
      clientWidth.mockRestore()
      rect.mockRestore()
    }
  })

  it("follows the Full and Short number format preferences", () => {
    // Fake a narrow card (100px, 10px per character) where Auto would shorten.
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100)
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const text = Array.from(this.querySelectorAll<HTMLElement>("[data-text]"))
        .map((el) => el.dataset.text)
        .join(" ")
      return { width: text.length * 10 } as DOMRect
    })
    const props = {
      filteredAccountsCount: 10,
      totalAccountsCount: 20,
      filteredCentersCount: 5,
      totalCentersCount: 10,
      filteredUpcomingCentersCount: 1,
      totalUpcomingCentersCount: 2,
      filteredProspectsCount: 50,
      totalProspectsCount: 100,
      filteredHeadcount: 1500000,
      totalHeadcount: 2000000,
      activeView: "accounts" as const,
      onSelect: vi.fn(),
    }

    try {
      window.localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, "full")
      const { getByText, rerender } = render(<SummaryCards {...props} />)
      expect(getByText((1500000).toLocaleString())).not.toBeNull()
      // A cut-off total keeps its full value on hover in Full mode.
      const fullTotal = getByText(`of ${(2000000).toLocaleString()}`)
      expect(tooltipFor(fullTotal)).toBeNull()
      const scrollWidth = vi.spyOn(fullTotal, "scrollWidth", "get").mockReturnValue(200)
      expect(tooltipFor(fullTotal)).toBe(`of ${(2000000).toLocaleString()}`)
      scrollWidth.mockRestore()

      // Another tab changing the setting applies without a reload.
      act(() => {
        window.localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, "short")
        window.dispatchEvent(new StorageEvent("storage", { key: NUMBER_FORMAT_STORAGE_KEY }))
      })
      rerender(<SummaryCards {...props} />)
      expect(tooltipFor(getByText("1.5M"))).toBe((1500000).toLocaleString())
      expect(getByText("of 2M")).not.toBeNull()
      // Counts under 1,000 have no short form.
      expect(getByText("10")).not.toBeNull()
    } finally {
      clientWidth.mockRestore()
      rect.mockRestore()
    }
  })

  it("shows a toast when an overview-only card is clicked", () => {
    const { getByText } = render(
      <SummaryCards
        filteredAccountsCount={10}
        totalAccountsCount={20}
        filteredCentersCount={5}
        totalCentersCount={10}
        filteredUpcomingCentersCount={1}
        totalUpcomingCentersCount={2}
        filteredProspectsCount={50}
        totalProspectsCount={100}
        filteredHeadcount={5000}
        totalHeadcount={10000}
        activeView="centers"
        onSelect={vi.fn()}
      />
    )

    const headcountCard = getByText("Headcount").closest(".rounded-xl")
    if (headcountCard) fireEvent.click(headcountCard)
    expect(toast.info).toHaveBeenCalledWith(
      "Headcount is an overview figure",
      expect.objectContaining({
        description: "Employees at the centres shown, leaving out manufacturing, sales & marketing, BPO and distribution centres",
      })
    )
  })
})
