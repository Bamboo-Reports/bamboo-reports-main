import { useCallback, useEffect, useRef, useState } from "react"
import { driver, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { TOUR_AUTO_START_DELAY_MS } from "@/lib/tour/constants"
import { getAnalyticsStepTitle, getDashboardTourSteps } from "@/lib/tour/steps"
import { useTourPersistence } from "@/hooks/use-tour-persistence"
import { subscribePreference } from "@/hooks/use-persisted-preference"
import { readSidebarCollapsed, SIDEBAR_COLLAPSED_STORAGE_KEY } from "@/hooks/use-sidebar-collapsed"

interface UseProductTourOptions {
  userId: string | null
  dataLoaded: boolean
  hasMapView: boolean
}

export function useProductTour({ userId, dataLoaded, hasMapView }: UseProductTourOptions) {
  const { isCompleted, isLoading, markCompleted } = useTourPersistence(userId)
  const [isRunning, setIsRunning] = useState(false)
  const driverRef = useRef<Driver | null>(null)
  const hasAutoStartedRef = useRef(false)
  const stepIndexRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const tourLayoutRef = useRef<{ hasMapView: boolean; isSidebarCollapsed: boolean } | null>(null)
  // The sidebar state is read when the tour needs it, not subscribed to, so a
  // sidebar toggle does not re-render the page. Only a running tour listens,
  // to re-point its steps at the new layout.
  const [sidebarVersion, setSidebarVersion] = useState(0)

  const createDriver = useCallback(() => {
    const steps = getDashboardTourSteps({ hasMapView, isSidebarCollapsed: readSidebarCollapsed() })

    const instance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: false,
      allowClose: true,
      overlayColor: "black",
      overlayOpacity: 0.5,
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: "br-tour-popover",
      prevBtnText: "Back",
      nextBtnText: "Next",
      doneBtnText: "Done",
      steps,
      onHighlightStarted: (_element, step, opts) => {
        stepIndexRef.current = opts.state.activeIndex ?? 0
        captureEvent(ANALYTICS_EVENTS.TOUR_STEP_VIEWED, {
          step_index: opts.state.activeIndex,
          step_title: getAnalyticsStepTitle(step.popover?.title),
        })
      },
      onDestroyStarted: (_element, _step, opts) => {
        if (isRefreshingRef.current) {
          instance.destroy()
          return
        }

        const totalSteps = steps.length
        const isLastStep = (opts.state.activeIndex ?? 0) === totalSteps - 1

        if (isLastStep) {
          captureEvent(ANALYTICS_EVENTS.TOUR_COMPLETED, {
            total_steps: totalSteps,
          })
        } else {
          captureEvent(ANALYTICS_EVENTS.TOUR_SKIPPED, {
            skipped_at_step: opts.state.activeIndex,
            total_steps: totalSteps,
          })
        }

        markCompleted()
        setIsRunning(false)
        instance.destroy()
      },
    })

    return instance
  }, [hasMapView, markCompleted])

  const driveTour = useCallback(
    (startIndex = 0, trackStart = true) => {
      const instance = createDriver()
      driverRef.current = instance

      if (trackStart) {
        captureEvent(ANALYTICS_EVENTS.TOUR_STARTED, {
          is_replay: isCompleted,
        })
      }

      tourLayoutRef.current = { hasMapView, isSidebarCollapsed: readSidebarCollapsed() }
      setIsRunning(true)
      instance.drive(startIndex)
    },
    [createDriver, isCompleted, hasMapView]
  )

  const startTour = useCallback(() => {
    if (isRunning) return

    if (driverRef.current) {
      driverRef.current.destroy()
    }

    driveTour()
  }, [isRunning, driveTour])

  useEffect(() => {
    if (!isRunning) return
    return subscribePreference(SIDEBAR_COLLAPSED_STORAGE_KEY, () => setSidebarVersion((v) => v + 1))
  }, [isRunning])

  useEffect(() => {
    if (!isRunning || !driverRef.current) {
      return
    }

    const isSidebarCollapsed = readSidebarCollapsed()
    const previousLayout = tourLayoutRef.current
    if (
      previousLayout &&
      previousLayout.hasMapView === hasMapView &&
      previousLayout.isSidebarCollapsed === isSidebarCollapsed
    ) {
      return
    }

    const nextSteps = getDashboardTourSteps({ hasMapView, isSidebarCollapsed })
    const nextIndex = Math.min(stepIndexRef.current, Math.max(nextSteps.length - 1, 0))

    isRefreshingRef.current = true
    driverRef.current.destroy()
    isRefreshingRef.current = false

    driveTour(nextIndex, false)
  }, [isRunning, hasMapView, sidebarVersion, driveTour])

  // Auto-start for first-time users
  useEffect(() => {
    if (hasAutoStartedRef.current || isLoading || isCompleted || !dataLoaded) return
    hasAutoStartedRef.current = true

    const timer = window.setTimeout(() => {
      startTour()
    }, TOUR_AUTO_START_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [isLoading, isCompleted, dataLoaded, startTour])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy()
      }
    }
  }, [])

  return { startTour, isRunning }
}
