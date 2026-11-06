"use client"

import { useCallback, useEffect, useRef } from "react"
import {
  captureEvent,
  ensureAnalyticsSession,
  identifyUser,
  setAnalyticsContext,
} from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot } from "@/lib/analytics/tracking"
import type { UserRole } from "@/lib/auth/roles"
import type { Filters } from "@/lib/types"
import {
  DEFAULT_SECTION,
  type DashboardSection,
  type EntityView,
  type ProspectsView,
} from "@/hooks/use-dashboard-layout"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

const HEARTBEAT_INTERVAL_MS = 60000
const IDLE_TIMEOUT_MS = 60000

type Range = { min: number; max: number }

export interface UseDashboardAnalyticsParams {
  authReady: boolean
  /**
   * True once the section and view from the address bar have been applied.
   * Until then changes are the page opening, not the user moving around.
   */
  layoutRestored?: boolean
  userId: string | null
  userEmail: string | null
  userRole: UserRole
  activeSection: DashboardSection
  accountsView: EntityView
  centersView: EntityView
  prospectsView: ProspectsView
  activeView: EntityView | ProspectsView
  activePage: number
  itemsPerPage: number
  filters: Filters
  activeFiltersCount: number
  filteredCounts: { accounts: number; centers: number; prospects: number }
  ranges: { revenue: Range; yearsInIndia: Range; centerIncYear: Range }
  summary: ServerDashboardData["summary"]
  pageError: string | null
  dataLoaded: boolean
}

/**
 * Product analytics for the dashboard session: who the user is, the session
 * lifecycle (start, heartbeat, idle, end), time on each screen, section, view
 * and page changes, empty filter results, error states and the first load.
 *
 * Returns `trackExportCompleted`, which feeds the export count reported with
 * the heartbeat and session end.
 */
export function useDashboardAnalytics({
  authReady,
  layoutRestored = true,
  userId,
  userEmail,
  userRole,
  activeSection,
  accountsView,
  centersView,
  prospectsView,
  activeView,
  activePage,
  itemsPerPage,
  filters,
  activeFiltersCount,
  filteredCounts,
  ranges,
  summary,
  pageError,
  dataLoaded,
}: UseDashboardAnalyticsParams) {
  const hasTrackedDashboardLoadRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const currentScreenStartRef = useRef<number | null>(null)
  // Set once the opening section and views are known; section and view
  // changes before that are the address bar being applied, not navigation.
  const baselinedRef = useRef(false)
  const currentScreenRef = useRef<DashboardSection>(DEFAULT_SECTION)
  const previousPageRef = useRef<Record<DashboardSection, number>>({ accounts: 1, centers: 1, prospects: 1 })
  const previousAccountsViewRef = useRef<EntityView>("map")
  const previousCentersViewRef = useRef<EntityView>("map")
  const previousProspectsViewRef = useRef<ProspectsView>("chart")
  const viewSwitchCountRef = useRef(0)
  const exportCountRef = useRef(0)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const isIdleRef = useRef(false)
  const noResultsSignatureRef = useRef<string | null>(null)
  const [revenueMin, revenueMax] = [ranges.revenue.min, ranges.revenue.max]
  const [yearsMin, yearsMax] = [ranges.yearsInIndia.min, ranges.yearsInIndia.max]
  const [incYearMin, incYearMax] = [ranges.centerIncYear.min, ranges.centerIncYear.max]

  useEffect(() => {
    setAnalyticsContext({
      screen: activeSection,
      screen_view: activeView,
      active_filters_count: activeFiltersCount,
      filtered_accounts_count: filteredCounts.accounts,
      filtered_centers_count: filteredCounts.centers,
      filtered_prospects_count: filteredCounts.prospects,
      is_filtered: activeFiltersCount > 0,
    })
  }, [activeSection, activeView, activeFiltersCount, filteredCounts])

  const captureCurrentScreenTime = useCallback((endedReason: "section_change" | "session_end") => {
    if (!currentScreenStartRef.current) {
      return
    }
    const durationSeconds = Math.max(0, Math.round((Date.now() - currentScreenStartRef.current) / 1000))
    captureEvent(ANALYTICS_EVENTS.SCREEN_TIME_SPENT, {
      screen: currentScreenRef.current,
      duration_seconds: durationSeconds,
      ended_reason: endedReason,
    })
  }, [])

  // Identify in its own effect so a late role update re-identifies without
  // restarting the tracked session below
  useEffect(() => {
    if (!authReady || !userId) {
      return
    }
    ensureAnalyticsSession()
    identifyUser({ id: userId, email: userEmail, authProvider: "email", role: userRole })
  }, [authReady, userId, userEmail, userRole])

  useEffect(() => {
    if (!authReady || !userId) {
      return
    }

    ensureAnalyticsSession()

    hasTrackedDashboardLoadRef.current = false
    sessionStartRef.current = Date.now()
    currentScreenStartRef.current = Date.now()
    previousPageRef.current = { accounts: 1, centers: 1, prospects: 1 }
    viewSwitchCountRef.current = 0
    exportCountRef.current = 0

    captureEvent(ANALYTICS_EVENTS.SESSION_STARTED, {
      screen: currentScreenRef.current,
    })

    heartbeatIntervalRef.current = window.setInterval(() => {
      const elapsedSeconds = sessionStartRef.current
        ? Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000))
        : 0
      captureEvent(ANALYTICS_EVENTS.SESSION_HEARTBEAT, {
        elapsed_seconds: elapsedSeconds,
        view_switch_count: viewSwitchCountRef.current,
        exports_count: exportCountRef.current,
      })
    }, HEARTBEAT_INTERVAL_MS)

    const clearIdleTimer = () => {
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current)
      }
    }

    const startIdleTimer = () => {
      clearIdleTimer()
      idleTimeoutRef.current = window.setTimeout(() => {
        if (isIdleRef.current) {
          return
        }
        isIdleRef.current = true
        captureEvent(ANALYTICS_EVENTS.SESSION_IDLE_STARTED, {
          idle_timeout_ms: IDLE_TIMEOUT_MS,
        })
      }, IDLE_TIMEOUT_MS)
    }

    const handleActivity = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false
        captureEvent(ANALYTICS_EVENTS.SESSION_RESUMED, {
          resumed_via: "user_activity",
        })
      }
      startIdleTimer()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearIdleTimer()
        return
      }
      handleActivity()
    }

    startIdleTimer()

    window.addEventListener("mousemove", handleActivity, { passive: true })
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("click", handleActivity)
    window.addEventListener("scroll", handleActivity, { passive: true })
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current)
      }
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current)
      }
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("click", handleActivity)
      window.removeEventListener("scroll", handleActivity)
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      captureCurrentScreenTime("session_end")

      const durationSeconds = sessionStartRef.current
        ? Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000))
        : 0

      captureEvent(ANALYTICS_EVENTS.SESSION_ENDED, {
        duration_seconds: durationSeconds,
        view_switch_count: viewSwitchCountRef.current,
        exports_count: exportCountRef.current,
      })
    }
  }, [authReady, userId, userEmail, captureCurrentScreenTime])

  useEffect(() => {
    const totalVisible = filteredCounts.accounts + filteredCounts.centers + filteredCounts.prospects
    const signature = `${activeFiltersCount}:${totalVisible}`

    if (activeFiltersCount > 0 && totalVisible === 0 && noResultsSignatureRef.current !== signature) {
      captureEvent(ANALYTICS_EVENTS.NO_RESULTS_AFTER_FILTER, {
        active_filters_count: activeFiltersCount,
        active_section: activeSection,
        active_view: activeView,
        filters_snapshot: buildTrackedFiltersSnapshot(filters, {
          accountHqRevenueRange: [revenueMin, revenueMax],
          accountYearsInIndiaRange: [yearsMin, yearsMax],
          centerIncYearRange: [incYearMin, incYearMax],
        }),
      })
      noResultsSignatureRef.current = signature
      return
    }

    if (totalVisible > 0 || activeFiltersCount === 0) {
      noResultsSignatureRef.current = null
    }
  }, [
    activeFiltersCount,
    filteredCounts,
    activeSection,
    activeView,
    filters,
    revenueMin,
    revenueMax,
    yearsMin,
    yearsMax,
    incYearMin,
    incYearMax,
  ])

  useEffect(() => {
    if (!pageError) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.ERROR_STATE_SHOWN, {
      error_message: pageError,
    })
  }, [pageError])

  // Declared before the change effects below so that, in the render where the
  // address bar's section and view land, the baseline is taken first and they
  // see nothing to report.
  useEffect(() => {
    if (baselinedRef.current || !layoutRestored) return
    baselinedRef.current = true
    currentScreenRef.current = activeSection
    previousAccountsViewRef.current = accountsView
    previousCentersViewRef.current = centersView
    previousProspectsViewRef.current = prospectsView
  }, [layoutRestored, activeSection, accountsView, centersView, prospectsView])

  useEffect(() => {
    if (!baselinedRef.current || currentScreenRef.current === activeSection) {
      return
    }
    captureCurrentScreenTime("section_change")
    captureEvent(ANALYTICS_EVENTS.SECTION_CHANGED, {
      from_screen: currentScreenRef.current,
      to_screen: activeSection,
    })
    viewSwitchCountRef.current += 1
    currentScreenRef.current = activeSection
    currentScreenStartRef.current = Date.now()
  }, [activeSection, captureCurrentScreenTime])

  useEffect(() => {
    if (!baselinedRef.current || previousAccountsViewRef.current === accountsView) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "accounts",
      from_view: previousAccountsViewRef.current,
      to_view: accountsView,
    })
    viewSwitchCountRef.current += 1
    previousAccountsViewRef.current = accountsView
  }, [accountsView])

  useEffect(() => {
    if (!baselinedRef.current || previousCentersViewRef.current === centersView) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "centers",
      from_view: previousCentersViewRef.current,
      to_view: centersView,
    })
    viewSwitchCountRef.current += 1
    previousCentersViewRef.current = centersView
  }, [centersView])

  useEffect(() => {
    if (!baselinedRef.current || previousProspectsViewRef.current === prospectsView) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "prospects",
      from_view: previousProspectsViewRef.current,
      to_view: prospectsView,
    })
    viewSwitchCountRef.current += 1
    previousProspectsViewRef.current = prospectsView
  }, [prospectsView])

  useEffect(() => {
    if (previousPageRef.current[activeSection] === activePage) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.PAGE_CHANGED, {
      page: activePage,
      items_per_page: itemsPerPage,
      screen: activeSection,
    })
    previousPageRef.current[activeSection] = activePage
  }, [activePage, itemsPerPage, activeSection])

  // Before sign-in finishes nothing is loading and there is no error, so
  // dataLoaded is already true; wait for real counts instead of reporting zeros.
  useEffect(() => {
    if (!dataLoaded || !summary || hasTrackedDashboardLoadRef.current) {
      return
    }
    captureEvent(ANALYTICS_EVENTS.DASHBOARD_LOADED, {
      total_accounts_count: summary?.full.accounts ?? 0,
      total_centers_count: summary?.full.centers ?? 0,
      total_services_count: summary?.full.services ?? 0,
      total_prospects_count: summary?.full.prospects ?? 0,
    })
    hasTrackedDashboardLoadRef.current = true
  }, [dataLoaded, summary])

  const trackExportCompleted = useCallback(() => {
    exportCountRef.current += 1
  }, [])

  return { trackExportCompleted }
}
