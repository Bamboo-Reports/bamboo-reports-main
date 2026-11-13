// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useProductTour } from "@/hooks/use-product-tour"
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed"
import { TOUR_AUTO_START_DELAY_MS } from "@/lib/tour/constants"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("driver.js/dist/driver.css", () => ({}))

// Each driver records the steps it was built with and where it was started.
const drivers = vi.hoisted(() => [] as Array<{ steps: unknown[]; drive: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>)
vi.mock("driver.js", () => ({
  driver: (config: { steps: unknown[] }) => {
    const instance = { steps: config.steps, drive: vi.fn(), destroy: vi.fn() }
    drivers.push(instance)
    return instance
  },
}))
// One step per layout detail, so a test can tell which layout a driver was built for.
vi.mock("@/lib/tour/steps", () => ({
  getDashboardTourSteps: (options: { hasMapView: boolean; isSidebarCollapsed: boolean }) => [
    { popover: { title: `map:${options.hasMapView}` } },
    { popover: { title: `collapsed:${options.isSidebarCollapsed}` } },
  ],
  getAnalyticsStepTitle: (title: unknown) => title,
}))
vi.mock("@/hooks/use-tour-persistence", () => ({
  useTourPersistence: () => ({ isCompleted: false, isLoading: false, markCompleted: vi.fn() }),
}))

/** The tour and the sidebar toggle, as the dashboard and its sidebar use them. */
const setup = (hasMapView = true) =>
  renderHook(
    (props: { hasMapView: boolean }) => ({
      tour: useProductTour({ userId: "user-1", dataLoaded: true, hasMapView: props.hasMapView }),
      sidebar: useSidebarCollapsed(),
    }),
    { initialProps: { hasMapView } }
  )

beforeEach(() => {
  vi.useFakeTimers()
  drivers.length = 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe("useProductTour", () => {
  it("auto-starts even when the view changes before the delay is up", () => {
    const { rerender } = setup(true)
    act(() => void vi.advanceTimersByTime(TOUR_AUTO_START_DELAY_MS - 500))
    rerender({ hasMapView: false })
    act(() => void vi.advanceTimersByTime(TOUR_AUTO_START_DELAY_MS))
    expect(drivers).toHaveLength(1)
    expect(drivers[0].steps).toContainEqual({ popover: { title: "map:false" } })
    expect(drivers[0].drive).toHaveBeenCalledWith(0)
  })

  it("auto-starts once, not again after the tour is running", () => {
    setup()
    act(() => void vi.advanceTimersByTime(TOUR_AUTO_START_DELAY_MS * 3))
    expect(drivers).toHaveLength(1)
  })

  it("re-points a running tour at the sidebar's new layout when it is toggled", () => {
    const { result } = setup()
    act(() => result.current.tour.startTour())
    expect(drivers).toHaveLength(1)
    expect(drivers[0].steps).toContainEqual({ popover: { title: "collapsed:false" } })

    act(() => result.current.sidebar.toggleSidebar())

    expect(drivers[0].destroy).toHaveBeenCalled()
    expect(drivers).toHaveLength(2)
    expect(drivers[1].steps).toContainEqual({ popover: { title: "collapsed:true" } })
    expect(result.current.tour.isRunning).toBe(true)
  })

  it("does not rebuild the tour for a toggle while it is not running", () => {
    const { result } = setup()
    act(() => result.current.sidebar.toggleSidebar())
    expect(drivers).toHaveLength(0)
  })
})
