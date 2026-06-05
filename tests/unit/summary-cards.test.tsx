// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"
import { SummaryCards, calculateAnimatedNumberValue } from "@/components/dashboard/summary-cards"
import * as dashboardAccess from "@/lib/config/dashboard-access"
import { toast } from "sonner"

vi.mock("@/lib/config/dashboard-access", () => ({
  isSectionEnabled: vi.fn(),
  getSectionUnavailableMessage: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}))

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
  })

  it("calculates animated number value correctly", () => {
    expect(calculateAnimatedNumberValue({ startValue: 0, targetValue: 100, progress: 0.5 })).toBeGreaterThan(0)
    expect(calculateAnimatedNumberValue({ startValue: 0, targetValue: 100, progress: 1 })).toBe(100)
    expect(calculateAnimatedNumberValue({ startValue: 100, targetValue: 50, progress: 1 })).toBe(50)
  })

  it("renders the summary cards and handles click events on enabled sections", () => {
    vi.mocked(dashboardAccess.isSectionEnabled).mockReturnValue(true)
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

  it("renders read-only cards and shows toast on click when sections are disabled", () => {
    vi.mocked(dashboardAccess.isSectionEnabled).mockImplementation((section) => section !== "accounts")
    vi.mocked(dashboardAccess.getSectionUnavailableMessage).mockReturnValue("Not available")
    
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
        filteredHeadcount={5000} // Test >1K compact formatting
        totalHeadcount={10000}
        activeView="centers"
        onSelect={vi.fn()}
      />
    )

    const accountsCardTitle = getByText("Accounts")
    const accountsCard = accountsCardTitle.closest(".rounded-xl")
    if (accountsCard) fireEvent.click(accountsCard)
    expect(toast.info).toHaveBeenCalledWith("Not available", expect.any(Object))
  })
})
