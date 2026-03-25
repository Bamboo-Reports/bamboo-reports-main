"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExportDialog } from "@/components/export/export-dialog"
import { FiltersSidebar } from "@/components/filters/filters-sidebar"
import { Header } from "@/components/layout/header"
import { ErrorState } from "@/components/states/error-state"
import { LoadingState } from "@/components/states/loading-state"
import { AccountsTab, CentersTab } from "@/components/tabs"
import { ProspectsTab } from "@/components/tabs/prospects-tab"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { Tabs } from "@/components/ui/tabs"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useDashboardData } from "@/hooks/use-dashboard-data"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import {
  captureEvent,
  ensureAnalyticsSession,
  identifyUser,
  setAnalyticsContext,
} from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot } from "@/lib/analytics/tracking"
import { canExportData } from "@/lib/auth/roles"
import { formatRevenueInMillions } from "@/lib/utils/helpers"

const SIDEBAR_COLLAPSED_STORAGE_KEY = "br-dashboard-sidebar-collapsed"

function DashboardContent(): JSX.Element | null {
  const { authReady, userId, userEmail, userRole } = useAuthGuard()

  const {
    accounts,
    centers,
    functions,
    services,
    tech,
    prospects,
    loading,
    error,
    connectionStatus,
    databaseStatus,
    loadData,
  } = useDashboardData({ enabled: authReady && !!userId })

  const {
    filters,
    pendingFilters,
    setPendingFilters,
    isApplying,
    revenueRange,
    yearsInIndiaRange,
    centerIncYearRange,
    accountNames,
    availableOptions,
    filteredData,
    accountChartData,
    centerChartData,
    prospectChartData,
    resetFilters,
    handleLoadSavedFilters,
    handleMinRevenueChange,
    handleMaxRevenueChange,
    handleRevenueRangeChange,
    handleMinYearsInIndiaChange,
    handleMaxYearsInIndiaChange,
    handleYearsInIndiaRangeChange,
    handleMinCenterIncYearChange,
    handleMaxCenterIncYearChange,
    handleCenterIncYearRangeChange,
    getTotalActiveFilters,
  } = useDashboardFilters({
    accounts,
    centers,
    functions,
    services,
    prospects,
    tech,
  })

  const [accountsPage, setAccountsPage] = useState(1)
  const [centersPage, setCentersPage] = useState(1)
  const [prospectsPage, setProspectsPage] = useState(1)
  const itemsPerPage = 51
  const [accountsView, setAccountsView] = useState<"chart" | "data" | "map">("map")
  const [centersView, setCentersView] = useState<"chart" | "data" | "map">("map")
  const [prospectsView, setProspectsView] = useState<"chart" | "data">("chart")
  const [activeSection, setActiveSection] = useState<"accounts" | "centers" | "prospects">("accounts")
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const canExport = canExportData(userRole)

  const hasTrackedDashboardLoadRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const currentScreenStartRef = useRef<number | null>(null)
  const currentScreenRef = useRef<"accounts" | "centers" | "prospects">("accounts")
  const previousPageRef = useRef<Record<"accounts" | "centers" | "prospects", number>>({
    accounts: 1,
    centers: 1,
    prospects: 1,
  })
  const previousAccountsViewRef = useRef<"chart" | "data" | "map">("map")
  const previousCentersViewRef = useRef<"chart" | "data" | "map">("map")
  const previousProspectsViewRef = useRef<"chart" | "data">("chart")
  const viewSwitchCountRef = useRef(0)
  const exportCountRef = useRef(0)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const isIdleRef = useRef(false)
  const noResultsSignatureRef = useRef<string | null>(null)
  const previousSidebarCollapsedRef = useRef<boolean | null>(null)

  const activeFiltersCount = getTotalActiveFilters()

  const currentScreenView = useMemo(() => {
    if (activeSection === "accounts") {
      return accountsView
    }
    if (activeSection === "centers") {
      return centersView
    }
    return prospectsView
  }, [activeSection, accountsView, centersView, prospectsView])

  const activePage = useMemo(() => {
    if (activeSection === "accounts") {
      return accountsPage
    }
    if (activeSection === "centers") {
      return centersPage
    }
    return prospectsPage
  }, [activeSection, accountsPage, centersPage, prospectsPage])

  useEffect(() => {
    setAccountsPage(1)
    setCentersPage(1)
    setProspectsPage(1)
  }, [filters])

  useEffect(() => {
    const storedSidebarState = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    if (storedSidebarState === "true") {
      setIsSidebarCollapsed(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

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

  useEffect(() => {
    setAnalyticsContext({
      screen: activeSection,
      screen_view: currentScreenView,
      active_filters_count: activeFiltersCount,
      filtered_accounts_count: filteredData.filteredAccounts.length,
      filtered_centers_count: filteredData.filteredCenters.length,
      filtered_prospects_count: filteredData.filteredProspects.length,
      is_filtered: activeFiltersCount > 0,
    })
  }, [
    activeSection,
    currentScreenView,
    activeFiltersCount,
    filteredData.filteredAccounts.length,
    filteredData.filteredCenters.length,
    filteredData.filteredProspects.length,
  ])

  const captureCurrentScreenTime = useCallback(
    (endedReason: "section_change" | "session_end") => {
      if (!currentScreenStartRef.current) {
        return
      }

      const durationSeconds = Math.max(0, Math.round((Date.now() - currentScreenStartRef.current) / 1000))
      captureEvent(ANALYTICS_EVENTS.SCREEN_TIME_SPENT, {
        screen: currentScreenRef.current,
        duration_seconds: durationSeconds,
        ended_reason: endedReason,
      })
    },
    []
  )

  useEffect(() => {
    if (!authReady || !userId) {
      return
    }

    ensureAnalyticsSession()
    identifyUser({ id: userId, email: userEmail, authProvider: "email" })

    hasTrackedDashboardLoadRef.current = false
    sessionStartRef.current = Date.now()
    currentScreenStartRef.current = Date.now()
    currentScreenRef.current = "accounts"
    previousPageRef.current = {
      accounts: 1,
      centers: 1,
      prospects: 1,
    }
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
    }, 30000)

    const IDLE_TIMEOUT_MS = 60000

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
    const totalVisible =
      filteredData.filteredAccounts.length + filteredData.filteredCenters.length + filteredData.filteredProspects.length
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
    filteredData.filteredAccounts.length,
    filteredData.filteredCenters.length,
    filteredData.filteredProspects.length,
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

  useEffect(() => {
    if (!error) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.ERROR_STATE_SHOWN, {
      error_message: error,
      has_database_status: Boolean(databaseStatus),
      has_database_url: databaseStatus?.hasUrl ?? false,
      has_database_connection: databaseStatus?.hasConnection ?? false,
    })
  }, [error, databaseStatus])

  useEffect(() => {
    if (currentScreenRef.current === activeSection) {
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
    if (previousAccountsViewRef.current === accountsView) {
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
    if (previousCentersViewRef.current === centersView) {
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
    if (previousProspectsViewRef.current === prospectsView) {
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

  const dataLoaded =
    !loading && accounts.length > 0 && centers.length > 0 && services.length > 0 && prospects.length > 0

  useEffect(() => {
    if (!dataLoaded || hasTrackedDashboardLoadRef.current) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.DASHBOARD_LOADED, {
      total_accounts_count: accounts.length,
      total_centers_count: centers.length,
      total_services_count: services.length,
      total_prospects_count: prospects.length,
    })

    hasTrackedDashboardLoadRef.current = true
  }, [dataLoaded, accounts.length, centers.length, services.length, prospects.length])

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    loadData()
  }, [loadData])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    loadData()
  }, [loadData])

  const handleExportAll = useCallback(() => {
    if (!canExport) {
      return
    }
    setExportDialogOpen(true)
  }, [canExport])

  const handleExportCompleted = useCallback(() => {
    exportCountRef.current += 1
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((current) => !current)
  }, [])

  const handleSectionSelect = useCallback((section: "accounts" | "centers" | "prospects") => {
    setActiveSection(section)
  }, [])

  if (!authReady || !userId) {
    return null
  }

  if (loading) {
    return <LoadingState connectionStatus={connectionStatus} dbStatus={databaseStatus} />
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        dbStatus={databaseStatus}
        onRetry={handleErrorRetry}
      />
    )
  }

  return (
    <div className="h-screen bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))] flex flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow"
      >
        Skip to main content
      </a>
      <Header onRefresh={handleRefresh} />

      {dataLoaded && (
        <main
          id="main-content"
          className="flex flex-1 overflow-hidden [--dashboard-content-top-gap:1.5rem] [--dashboard-content-bottom-gap:0.75rem] [--dashboard-panel-height:calc(100dvh-18.75rem)]"
        >
          <ExportDialog
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
            data={{
              accounts: filteredData.filteredAccounts,
              centers: filteredData.filteredCenters,
              services: filteredData.filteredServices,
              prospects: filteredData.filteredProspects,
            }}
            isFiltered={activeFiltersCount > 0}
            onExportCompleted={handleExportCompleted}
          />
          <FiltersSidebar
            filters={filters}
            pendingFilters={pendingFilters}
            availableOptions={availableOptions}
            isApplying={isApplying}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            revenueRange={revenueRange}
            yearsInIndiaRange={yearsInIndiaRange}
            centerIncYearRange={centerIncYearRange}
            accountNames={accountNames}
            setPendingFilters={setPendingFilters}
            resetFilters={resetFilters}
            handleExportAll={handleExportAll}
            canExport={canExport}
            handleMinRevenueChange={handleMinRevenueChange}
            handleMaxRevenueChange={handleMaxRevenueChange}
            handleRevenueRangeChange={handleRevenueRangeChange}
            handleMinYearsInIndiaChange={handleMinYearsInIndiaChange}
            handleMaxYearsInIndiaChange={handleMaxYearsInIndiaChange}
            handleYearsInIndiaRangeChange={handleYearsInIndiaRangeChange}
            handleMinCenterIncYearChange={handleMinCenterIncYearChange}
            handleMaxCenterIncYearChange={handleMaxCenterIncYearChange}
            handleCenterIncYearRangeChange={handleCenterIncYearRangeChange}
            getTotalActiveFilters={getTotalActiveFilters}
            handleLoadSavedFilters={handleLoadSavedFilters}
            formatRevenueInMillions={formatRevenueInMillions}
          />

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-gutter-stable">
              <div className="px-6 pt-[var(--dashboard-content-top-gap)] pb-[var(--dashboard-content-bottom-gap)]">
                <SummaryCards
                  filteredAccountsCount={filteredData.filteredAccounts.length}
                  totalAccountsCount={accounts.length}
                  filteredCentersCount={filteredData.filteredCenters.length}
                  totalCentersCount={centers.length}
                  filteredProspectsCount={filteredData.filteredProspects.length}
                  totalProspectsCount={prospects.length}
                  filteredHeadcount={filteredData.filteredCenters.reduce((sum, c) => sum + (c.center_employees ?? 0), 0)}
                  totalHeadcount={centers.reduce((sum, c) => sum + (c.center_employees ?? 0), 0)}
                  activeView={activeSection}
                  onSelect={handleSectionSelect}
                />

                <Tabs value={activeSection} className="space-y-4">
                  <AccountsTab
                    accounts={filteredData.filteredAccounts}
                    centers={filteredData.filteredCenters}
                    prospects={filteredData.filteredProspects}
                    services={filteredData.filteredServices}
                    tech={tech}
                    functions={functions}
                    accountChartData={accountChartData}
                    accountsView={accountsView}
                    setAccountsView={setAccountsView}
                    currentPage={accountsPage}
                    setCurrentPage={setAccountsPage}
                    itemsPerPage={itemsPerPage}
                  />

                  <CentersTab
                    centers={filteredData.filteredCenters}
                    allCenters={centers}
                    functions={functions}
                    services={filteredData.filteredServices}
                    centerChartData={centerChartData}
                    centersView={centersView}
                    setCentersView={setCentersView}
                    currentPage={centersPage}
                    setCurrentPage={setCentersPage}
                    itemsPerPage={itemsPerPage}
                  />

                  <ProspectsTab
                    prospects={filteredData.filteredProspects}
                    prospectChartData={prospectChartData}
                    prospectsView={prospectsView}
                    setProspectsView={setProspectsView}
                    currentPage={prospectsPage}
                    setCurrentPage={setProspectsPage}
                    itemsPerPage={itemsPerPage}
                  />
                </Tabs>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

export default DashboardContent
