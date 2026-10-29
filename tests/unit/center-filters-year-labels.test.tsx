// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
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
describe("Incorporation Timeline labels", () => {
  it("shows the year bounds without thousands separators", () => {
    const noop = () => {}
    render(
      <CenterFiltersSection
        pendingFilters={createDefaultFilters({ centerIncYearRange: [1913, 2030] })}
        availableOptions={new Proxy({}, { get: () => [] }) as never}
        isApplying={false}
        activeFilter={null}
        setPendingFilters={noop}
        setActiveFilter={noop}
        centerIncYearRange={{ min: 1913, max: 2030 }}
        handleMinCenterIncYearChange={noop}
        handleMaxCenterIncYearChange={noop}
        handleCenterIncYearRangeChange={noop}
      />
    )
    expect(screen.queryByText("1,913")).toBeNull()
    expect(screen.queryByText("2,030")).toBeNull()
    // The bounds now read from the Min and Max inputs under the slider.
    expect(screen.getByDisplayValue("1913")).toBeTruthy()
    expect(screen.getByDisplayValue("2030")).toBeTruthy()
  })
})
