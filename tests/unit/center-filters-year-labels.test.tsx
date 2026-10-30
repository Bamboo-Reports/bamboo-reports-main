// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { CenterFiltersSection } from "@/components/filters/filter-sections"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
})

// Incorporation years are years, not quantities: "1913", never "1,913" (#309).
describe("Incorporation year labels", () => {
  const noop = () => {}
  const renderSection = (range: [number, number]) =>
    render(
      <CenterFiltersSection
        pendingFilters={createDefaultFilters({ centerIncYearRange: range })}
        availableOptions={new Proxy({}, { get: () => [] }) as never}
        isApplying={false}
        activeFilter={null}
        setPendingFilters={noop}
        setActiveFilter={noop}
        centerIncYearRange={{ min: 1913, max: 2030 }}
        handleCenterIncYearRangeChange={noop}
      />
    )

  it("shows the year bounds without thousands separators", () => {
    renderSection([1913, 2030])
    fireEvent.click(screen.getByRole("button", { name: /Incorporation year/ }))
    expect(screen.queryByDisplayValue("1,913")).toBeNull()
    expect(screen.queryByDisplayValue("2,030")).toBeNull()
    expect(screen.getByDisplayValue("1913")).toBeTruthy()
    expect(screen.getByDisplayValue("2030")).toBeTruthy()
  })

  it("summarises a narrowed range as plain years", () => {
    renderSection([1998, 2015])
    expect(screen.getByText("1998 to 2015")).toBeTruthy()
  })
})
