import { useCallback, useEffect, useRef, useState } from "react"
import { driver, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { TOUR_AUTO_START_DELAY_MS } from "@/lib/tour/constants"
import { getDashboardTourSteps } from "@/lib/tour/steps"
import { useTourPersistence } from "@/hooks/use-tour-persistence"

interface UseProductTourOptions {
  userId: string | null
  dataLoaded: boolean
  hasMapView: boolean
  isSidebarCollapsed: boolean
}

export function useProductTour({ userId, dataLoaded, hasMapView, isSidebarCollapsed }: UseProductTourOptions) {
  const { isCompleted, isLoading, markCompleted } = useTourPersistence(userId)
  const [isRunning, setIsRunning] = useState(false)
  const driverRef = useRef<Driver | null>(null)
  const hasAutoStartedRef = useRef(false)
  const stepIndexRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const tourLayoutRef = useRef<{ hasMapView: boolean; isSidebarCollapsed: boolean } | null>(null)

  const createDriver = useCallback(() => {
    const steps = getDashboardTourSteps({ hasMapView, isSidebarCollapsed })

    const instance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: false,
      allowClose: true,
      overlayColor: "black",
      overlayOpacity: 0.5,
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: "br-tour-popover",
      prevBtnText: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="m15 18-6-6 6-6"/></svg>Previous',
      nextBtnText: 'Next<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:4px"><path d="m9 18 6-6-6-6"/></svg>',
      doneBtnText: 'Done<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:4px"><path d="M5 12l5 5L20 7"/></svg>',
      steps,
      onHighlightStarted: (_element, step, opts) => {
        stepIndexRef.current = opts.state.activeIndex ?? 0
        captureEvent(ANALYTICS_EVENTS.TOUR_STEP_VIEWED, {
          step_index: opts.state.activeIndex,
          step_title: step.popover?.title,
        })
      },
      onDestroyStarted: (_element, _step, opts) => {
        if (isRefreshingRef.current) {
          document.documentElement.classList.remove("tour-active")
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

        document.documentElement.classList.remove("tour-active")
        markCompleted()
        setIsRunning(false)
        instance.destroy()
      },
    })

    return instance
  }, [hasMapView, isSidebarCollapsed, markCompleted])

  const driveTour = useCallback(
    (startIndex = 0, trackStart = true) => {
      const instance = createDriver()
      driverRef.current = instance

      document.documentElement.classList.add("tour-active")

      if (trackStart) {
        captureEvent(ANALYTICS_EVENTS.TOUR_STARTED, {
          is_replay: isCompleted,
        })
      }

      tourLayoutRef.current = { hasMapView, isSidebarCollapsed }
      setIsRunning(true)
      instance.drive(startIndex)
    },
    [createDriver, isCompleted, hasMapView, isSidebarCollapsed]
  )

  const startTour = useCallback(() => {
    if (isRunning) return

    if (driverRef.current) {
      driverRef.current.destroy()
    }

    driveTour()
  }, [isRunning, driveTour])

  useEffect(() => {
    if (!isRunning || !driverRef.current) {
      return
    }

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
  }, [isRunning, hasMapView, isSidebarCollapsed, driveTour])

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
      document.documentElement.classList.remove("tour-active")
      if (driverRef.current) {
        driverRef.current.destroy()
      }
    }
  }, [])

  return { startTour, isRunning }
}
