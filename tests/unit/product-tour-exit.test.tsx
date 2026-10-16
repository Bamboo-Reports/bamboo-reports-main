// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Config, Driver } from "driver.js"
import { TOUR_EXIT_ANIMATION_MS } from "@/lib/tour/constants"

// A stand-in for driver.js that records each tour it is asked to create, so a
// test can close one the way Escape does (driver.js calls onDestroyStarted).
const drivers = vi.hoisted(() => [] as { config: Config; drive: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[])

vi.mock("driver.js", () => ({
  driver: (config: Config) => {
    const instance = { config, drive: vi.fn(), destroy: vi.fn() }
    drivers.push(instance)
    return instance as unknown as Driver
  },
}))
vi.mock("driver.js/dist/driver.css", () => ({}))
vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("@/hooks/use-tour-persistence", () => ({
  useTourPersistence: () => ({ isCompleted: true, isLoading: false, markCompleted: vi.fn() }),
}))
vi.mock("@/lib/tour/steps", () => ({
  getDashboardTourSteps: () => [{ popover: { title: "One" } }, { popover: { title: "Two" } }],
}))

import { useProductTour } from "@/hooks/use-product-tour"

const html = () => document.documentElement.classList

describe("product tour exit", () => {
  beforeEach(() => {
    drivers.length = 0
    vi.useFakeTimers()
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("stays closed when the layout changes while it animates out", () => {
    const { result, rerender } = renderHook((props: { isSidebarCollapsed: boolean }) =>
      useProductTour({ userId: "u1", dataLoaded: false, hasMapView: false, ...props }),
      { initialProps: { isSidebarCollapsed: false } }
    )

    act(() => result.current.startTour())
    expect(result.current.isRunning).toBe(true)
    expect(drivers).toHaveLength(1)

    // Escape on the first step: the exit animation starts.
    act(() => {
      drivers[0].config.onDestroyStarted?.(undefined, { popover: {} }, {
        config: drivers[0].config,
        state: { activeIndex: 0 },
        driver: drivers[0] as unknown as Driver,
      })
    })
    expect(html().contains("tour-exiting")).toBe(true)

    // The sidebar toggles before the animation ends.
    rerender({ isSidebarCollapsed: true })
    expect(drivers).toHaveLength(1)

    act(() => vi.advanceTimersByTime(TOUR_EXIT_ANIMATION_MS))
    expect(result.current.isRunning).toBe(false)
    expect(html().contains("tour-active")).toBe(false)
    expect(html().contains("tour-exiting")).toBe(false)
    expect(drivers[0].destroy).toHaveBeenCalled()
  })

  it("re-drives a running tour when the layout changes", () => {
    const { result, rerender } = renderHook((props: { isSidebarCollapsed: boolean }) =>
      useProductTour({ userId: "u1", dataLoaded: false, hasMapView: false, ...props }),
      { initialProps: { isSidebarCollapsed: false } }
    )

    act(() => result.current.startTour())
    rerender({ isSidebarCollapsed: true })

    expect(drivers).toHaveLength(2)
    expect(drivers[1].drive).toHaveBeenCalled()
    expect(result.current.isRunning).toBe(true)
  })
})
