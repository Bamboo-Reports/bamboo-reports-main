"use client"

import { useCallback, useEffect, useRef } from "react"
import { captureEvent, ensureAnalyticsSession, identifyUser, setAnalyticsContext } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot } from "@/lib/analytics/tracking"
import type { Filters } from "@/lib/types"
import type { DashboardSection } from "@/lib/config/dashboard-access"

type ViewMode = "chart" | "data" | "map"

interface UseAnalyticsOptions {
  authReady: boolean
  userId: string | null
  userEmail: string | null
  activeSection: DashboardSection
  accountsView: ViewMode
  centersView: ViewMode
  prospectsView: ViewMode
  accountsPage: number
  centersPage: number
  prospectsPage: number
  activeFiltersCount: number
  accountsCount: number
  centersCount: number
  servicesCount: number
  prospectsCount: number
  filteredAccountsLength: number
  filteredCentersLength: number
  filteredProspectsLength: number
  loading: boolean
  error: string | null
  isSidebarCollapsed: boolean
  isAccountsMapEnabled: boolean
  filters: Filters
  revenueRange: { min: number; max: number }
  yearsInIndiaRange: { min: number; max: number }
  centerIncYearRange: { min: number; max: number }
  accountsEnabled: boolean
  centersEnabled: boolean
  prospectsEnabled: boolean
}

export function useAnalytics(options: UseAnalyticsOptions) {
  const {
    authReady,
    userId,
    userEmail,
    activeSection,
    accountsView,
    centersView,
    prospectsView,
    accountsPage,
    centersPage,
    prospectsPage,
    activeFiltersCount,
    accountsCount,
    centersCount,
    servicesCount,
    prospectsCount,
    filteredAccountsLength,
    filteredCentersLength,
    filteredProspectsLength,
    loading,
    error,
    isSidebarCollapsed,
    isAccountsMapEnabled,
    filters,
    revenueRange,
    yearsInIndiaRange,
    centerIncYearRange,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
  } = options

  const currentScreenRef = useRef<DashboardSection>(activeSection)
  const sessionStartRef = useRef<number | null>(null)
  const currentScreenStartRef = useRef<number | null>(null)
  const previousAccountsViewRef = useRef<ViewMode>(isAccountsMapEnabled ? "map" : "chart")
  const previousCentersViewRef = useRef<ViewMode>("map")
  const previousProspectsViewRef = useRef<ViewMode>("chart")
  const previousPageRef = useRef<Record<DashboardSection, number>>({ accounts: 1, centers: 1, prospects: 1 })
  const viewSwitchCountRef = useRef(0)
  const exportCountRef = useRef(0)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const isIdleRef = useRef(false)
  const noResultsSignatureRef = useRef<string | null>(null)
  const previousSidebarCollapsedRef = useRef<boolean | null>(null)
  const hasTrackedDashboardLoadRef = useRef(false)

  const currentScreenView: ViewMode =
    activeSection === "accounts" ? accountsView : activeSection === "centers" ? centersView : prospectsView

  // Sidebar toggle analytics
  useEffect(() => {
    if (previousSidebarCollapsedRef.current === null) {
      previousSidebarCollapsedRef.current = isSidebarCollapsed
      return
    }
    if (previousSidebarCollapsedRef.current !== isSidebarCollapsed) {
      captureEvent(ANALYTICS_EVENTS.SIDEBAR_TOGGLED, {
        is_collapsed: isSidebarCollapsed,
      })
      previousSidebarCollapsedRef.current = isSidebarCollapsed
    }
  }, [isSidebarCollapsed])

  // Analytics context
  useEffect(() => {
    setAnalyticsContext({
      screen: activeSection,
      screen_view: currentScreenView,
      active_filters_count: activeFiltersCount,
      filtered_accounts_count: filteredAccountsLength,
      filtered_centers_count: filteredCentersLength,
      filtered_prospects_count: filteredProspectsLength,
      is_filtered: activeFiltersCount > 0,
    })
  }, [
    activeSection,
    currentScreenView,
    activeFiltersCount,
    filteredAccountsLength,
    filteredCentersLength,
    filteredProspectsLength,
  ])

  const captureCurrentScreenTime = useCallback((endedReason: "section_change" | "session_end") => {
    if (!currentScreenStartRef.current) return
    const durationSeconds = Math.max(0, Math.round((Date.now() - currentScreenStartRef.current) / 1000))
    captureEvent(ANALYTICS_EVENTS.SCREEN_TIME_SPENT, {
      screen: currentScreenRef.current,
      duration_seconds: durationSeconds,
      ended_reason: endedReason,
    })
  }, [])

  // Session lifecycle
  useEffect(() => {
    if (!authReady || !userId) return

    ensureAnalyticsSession()
    identifyUser({ id: userId, email: userEmail, authProvider: "email" })

    hasTrackedDashboardLoadRef.current = false
    sessionStartRef.current = Date.now()
    currentScreenStartRef.current = Date.now()
    currentScreenRef.current = activeSection
    previousPageRef.current = { accounts: 1, centers: 1, prospects: 1 }
    viewSwitchCountRef.current = 0
    exportCountRef.current = 0

    captureEvent(ANALYTICS_EVENTS.SESSION_STARTED, { screen: currentScreenRef.current })

    const HEARTBEAT_INTERVAL_MS = 60000
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

    const IDLE_TIMEOUT_MS = 60000
    const clearIdleTimer = () => {
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current)
      }
    }

    const startIdleTimer = () => {
      clearIdleTimer()
      idleTimeoutRef.current = window.setTimeout(() => {
        if (isIdleRef.current) return
        isIdleRef.current = true
        captureEvent(ANALYTICS_EVENTS.SESSION_IDLE_STARTED, { idle_timeout_ms: IDLE_TIMEOUT_MS })
      }, IDLE_TIMEOUT_MS)
    }

    const handleActivity = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false
        captureEvent(ANALYTICS_EVENTS.SESSION_RESUMED, { resumed_via: "user_activity" })
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
  }, [authReady, userId, userEmail, captureCurrentScreenTime, activeSection])

  // No-results detection
  useEffect(() => {
    const totalVisible =
      (accountsEnabled ? filteredAccountsLength : 0) +
      (centersEnabled ? filteredCentersLength : 0) +
      (prospectsEnabled ? filteredProspectsLength : 0)
    const signature = `${activeFiltersCount}:${totalVisible}`

    if (activeFiltersCount > 0 && totalVisible === 0 && noResultsSignatureRef.current !== signature) {
      captureEvent(ANALYTICS_EVENTS.NO_RESULTS_AFTER_FILTER, {
        active_filters_count: activeFiltersCount,
        active_section: activeSection,
        active_view: currentScreenView,
        filters_snapshot: buildTrackedFiltersSnapshot(filters, {
          accountHqRevenueRange: [revenueRange.min, revenueRange.max],
          accountYearsInIndiaRange: [yearsInIndiaRange.min, yearsInIndiaRange.max],
          centerIncYearRange: [centerIncYearRange.min, centerIncYearRange.max],
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
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
    filteredAccountsLength,
    filteredCentersLength,
    filteredProspectsLength,
    activeSection,
    currentScreenView,
    filters,
    revenueRange.min,
    revenueRange.max,
    yearsInIndiaRange.min,
    yearsInIndiaRange.max,
    centerIncYearRange.min,
    centerIncYearRange.max,
  ])

  // Error state tracking
  useEffect(() => {
    if (!error) return
    captureEvent(ANALYTICS_EVENTS.ERROR_STATE_SHOWN, { error_message: error })
  }, [error])

  // Section change tracking
  useEffect(() => {
    if (currentScreenRef.current === activeSection) return
    captureCurrentScreenTime("section_change")
    captureEvent(ANALYTICS_EVENTS.SECTION_CHANGED, {
      from_screen: currentScreenRef.current,
      to_screen: activeSection,
    })
    viewSwitchCountRef.current += 1
    currentScreenRef.current = activeSection
    currentScreenStartRef.current = Date.now()
  }, [activeSection, captureCurrentScreenTime])

  // View change tracking
  useEffect(() => {
    if (previousAccountsViewRef.current === accountsView) return
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "accounts",
      from_view: previousAccountsViewRef.current,
      to_view: accountsView,
    })
    viewSwitchCountRef.current += 1
    previousAccountsViewRef.current = accountsView
  }, [accountsView])

  useEffect(() => {
    if (previousCentersViewRef.current === centersView) return
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "centers",
      from_view: previousCentersViewRef.current,
      to_view: centersView,
    })
    viewSwitchCountRef.current += 1
    previousCentersViewRef.current = centersView
  }, [centersView])

  useEffect(() => {
    if (previousProspectsViewRef.current === prospectsView) return
    captureEvent(ANALYTICS_EVENTS.SECTION_VIEW_CHANGED, {
      screen: "prospects",
      from_view: previousProspectsViewRef.current,
      to_view: prospectsView,
    })
    viewSwitchCountRef.current += 1
    previousProspectsViewRef.current = prospectsView
  }, [prospectsView])

  // Page change tracking
  const activePage =
    activeSection === "accounts" ? accountsPage : activeSection === "centers" ? centersPage : prospectsPage
  useEffect(() => {
    if (previousPageRef.current[activeSection] === activePage) return
    captureEvent(ANALYTICS_EVENTS.PAGE_CHANGED, {
      page: activePage,
      items_per_page: 51,
      screen: activeSection,
    })
    previousPageRef.current[activeSection] = activePage
  }, [activePage, activeSection])

  // Dashboard loaded tracking
  useEffect(() => {
    if (loading || error || hasTrackedDashboardLoadRef.current) return
    captureEvent(ANALYTICS_EVENTS.DASHBOARD_LOADED, {
      total_accounts_count: accountsCount,
      total_centers_count: centersCount,
      total_services_count: servicesCount,
      total_prospects_count: prospectsCount,
    })
    hasTrackedDashboardLoadRef.current = true
  }, [loading, error, accountsCount, centersCount, servicesCount, prospectsCount])

  return {
    exportCountRef,
  }
}
