"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { ExportDialog } from "@/components/export/export-dialog"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import { ExportsDialog } from "@/components/exports/exports-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"
import { FavoritesDialog } from "@/components/favorites/favorites-dialog"
import { FiltersSidebar } from "@/components/filters/filters-sidebar"
import { Header } from "@/components/layout/header"
import { GlobalSearch } from "@/components/search/global-search"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import type { PieChartLabelDisplay } from "@/components/charts/pie-chart-card"
import { ErrorState } from "@/components/states/error-state"
import { LoadingState } from "@/components/states/loading-state"
import { AccountsTab, CentersTab } from "@/components/tabs"
import { ProspectsTab } from "@/components/tabs/prospects-tab"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { TopProgressBar } from "@/components/ui/top-progress-bar"
import { Tabs } from "@/components/ui/tabs"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import { useServerDashboardData, normalizeFiltersForServer } from "@/hooks/use-server-dashboard-data"
import {
  fetchAccountRelated,
  fetchCenterDetail,
  fetchDashboardChartsFull,
  fetchDashboardSummary,
  fetchProspectById,
  type EntitySort,
  type FacetRanges,
} from "@/lib/dashboard/api-client"
import { useGlobalSearch } from "@/hooks/use-global-search"
import { useRecentItems } from "@/hooks/use-recent-items"
import { useFavorites, type FavoriteItem, type FavoriteInput } from "@/hooks/use-favorites"
import { buildSummaryReport } from "@/lib/reports/summary-report"
import {
  captureEvent,
  ensureAnalyticsSession,
  identifyUser,
  setAnalyticsContext,
} from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { devError } from "@/lib/utils/dev-log"
import { buildTrackedFiltersSnapshot } from "@/lib/analytics/tracking"
import { canExportData } from "@/lib/auth/roles"
import {
  canAccessAccountsMapView,
  getAccessibleDefaultSection,
  getSectionUnavailableMessage,
  isSectionEnabled,
} from "@/lib/config/dashboard-access"
import { useProductTour } from "@/hooks/use-product-tour"
import { formatRevenueInMillions } from "@/lib/utils/helpers"
import type { SearchResult } from "@/lib/search"
import type { RecentItem } from "@/hooks/use-recent-items"
import type { Account, Alias, Center, Function as FunctionRow, Prospect, Service, Tech } from "@/lib/types"
import type { AccountVisibilityInfo } from "@/components/filters/account-autocomplete"

const SIDEBAR_COLLAPSED_STORAGE_KEY = "br-dashboard-sidebar-collapsed"

// Tab sort keys -> whitelisted server sort columns per entity (#249).
const SERVER_SORT_COLUMNS: Record<"accounts" | "centers" | "prospects", Record<string, string>> = {
  accounts: {
    name: "account_global_legal_name",
    industry: "account_hq_industry",
    revenue: "account_hq_revenue_range",
    employees: "account_center_employees_range",
  },
  centers: {
    name: "center_name",
    location: "center_city",
    type: "center_type",
    employees: "center_employees_range",
  },
  prospects: {
    name: "prospect_full_name",
    location: "prospect_city",
    title: "prospect_title",
    department: "prospect_department",
  },
}

// The dashboard is server-backed (#249): every dataset is paged and aggregated
// by the API and the client never holds the warehouse arrays. Components that
// still accept the arrays receive these stable empty lists.
const NO_ACCOUNTS: Account[] = []
const NO_CENTERS: Center[] = []
const NO_FUNCTIONS: FunctionRow[] = []
const NO_SERVICES: Service[] = []
const NO_TECH: Tech[] = []
const NO_PROSPECTS: Prospect[] = []
const NO_ALIASES: Alias[] = []

function DashboardContent(): React.JSX.Element | null {
  const accountsEnabled = isSectionEnabled("accounts")
  const centersEnabled = isSectionEnabled("centers")
  const prospectsEnabled = isSectionEnabled("prospects")
  const defaultSection = getAccessibleDefaultSection()
  const accountsMapEnabled = canAccessAccountsMapView()
  const { authReady, userId, userEmail, userRole } = useAuthGuard()

  const accounts = NO_ACCOUNTS
  const centers = NO_CENTERS
  const functions = NO_FUNCTIONS
  const services = NO_SERVICES
  const tech = NO_TECH
  const prospects = NO_PROSPECTS
  const aliases = NO_ALIASES

  // Base slider ranges come from the facets endpoint (set once it responds);
  // the filters hook skips its data-derived range mechanics.
  const [serverRanges, setServerRanges] = useState<FacetRanges | null>(null)

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
    serverRanges,
  })

  const [accountsPage, setAccountsPage] = useState(1)
  const [centersPage, setCentersPage] = useState(1)
  const [prospectsPage, setProspectsPage] = useState(1)
  const itemsPerPage = 51
  const [accountsView, setAccountsView] = useState<"chart" | "data" | "map">(accountsMapEnabled ? "map" : "chart")
  const [centersView, setCentersView] = useState<"chart" | "data" | "map">("map")
  const [prospectsView, setProspectsView] = useState<"chart" | "data">("chart")
  const [chartLabelDisplay, setChartLabelDisplay] = useState<PieChartLabelDisplay>({
    showCategoryLabels: true,
    showPercentages: true,
  })
  const [activeSection, setActiveSection] = useState<"accounts" | "centers" | "prospects">(defaultSection)

  // Server mode: per-entity sort state (the tabs report sort changes here).
  const [accountsSort, setAccountsSort] = useState<EntitySort | null>(null)
  const [centersSort, setCentersSort] = useState<EntitySort | null>(null)
  const [prospectsSort, setProspectsSort] = useState<EntitySort | null>(null)

  // What is visible right now, so charts/map/rows fetch lazily (#249 perf).
  const activeView =
    activeSection === "accounts" ? accountsView : activeSection === "centers" ? centersView : prospectsView
  const dashboardViews = useMemo(
    () => ({
      needCharts: activeView === "chart",
      needMap: activeView === "map",
      activeEntity: activeSection,
    }),
    [activeView, activeSection]
  )

  const serverData = useServerDashboardData({
    enabled: authReady && !!userId,
    filters,
    pages: { accounts: accountsPage, centers: centersPage, prospects: prospectsPage },
    sorts: { accounts: accountsSort, centers: centersSort, prospects: prospectsSort },
    pageSize: itemsPerPage,
    views: dashboardViews,
  })

  // Facets come back with every filter change, but the base ranges are global
  // (not filtered), so only adopt a new object when the values differ. The
  // filters hook keys its base-range sync on identity; a fresh object per
  // response would rewrite the applied ranges after every fetch, which both
  // drops a saved filter's narrowed range and triggers a second round trip.
  useEffect(() => {
    const ranges = serverData.facets?.ranges
    if (!ranges) return
    setServerRanges((prev) => (prev && JSON.stringify(prev) === JSON.stringify(ranges) ? prev : ranges))
  }, [serverData.facets])

  const makeSortHandler = useCallback(
    (entity: "accounts" | "centers" | "prospects", set: (s: EntitySort | null) => void) =>
      (key: string, direction: "asc" | "desc" | null) => {
        const column = SERVER_SORT_COLUMNS[entity][key]
        set(direction && column ? { column, direction } : null)
      },
    []
  )
  const accountsServerProps = useMemo(
    () =>
      ({
        total: serverData.entityPages.accounts?.total ?? 0,
        loading: serverData.entityPages.accounts === null || serverData.pending.accounts,
        onSortChange: makeSortHandler("accounts", setAccountsSort),
      }),
    [serverData.entityPages.accounts, serverData.pending.accounts, makeSortHandler]
  )
  const centersServerProps = useMemo(
    () =>
      ({
        total: serverData.entityPages.centers?.total ?? 0,
        loading: serverData.entityPages.centers === null || serverData.pending.centers,
        onSortChange: makeSortHandler("centers", setCentersSort),
      }),
    [serverData.entityPages.centers, serverData.pending.centers, makeSortHandler]
  )
  const prospectsServerProps = useMemo(
    () =>
      ({
        total: serverData.entityPages.prospects?.total ?? 0,
        loading: serverData.entityPages.prospects === null || serverData.pending.prospects,
        onSortChange: makeSortHandler("prospects", setProspectsSort),
      }),
    [serverData.entityPages.prospects, serverData.pending.prospects, makeSortHandler]
  )
  const serverMapData = useMemo(
    () =>
      serverData.map
        ? { cities: serverData.map.cities, states: serverData.map.states, scaleStates: serverData.scaleStates }
        : null,
    [serverData.map, serverData.scaleStates]
  )

  // Per-view data: the server pages, with the (empty-data) client engine
  // output as the placeholder before the first response.
  const viewAccounts = serverData.entityPages.accounts?.rows ?? []
  const viewCenters = serverData.entityPages.centers?.rows ?? []
  const viewProspects = serverData.entityPages.prospects?.rows ?? []
  const filteredCounts = useMemo(
    () => ({
      accounts: serverData.summary?.filtered.accounts ?? 0,
      centers: serverData.summary?.filtered.centers ?? 0,
      prospects: serverData.summary?.filtered.prospects ?? 0,
    }),
    [serverData.summary]
  )
  const viewAvailableOptions = serverData.facets?.options ?? availableOptions
  const viewAccountChartData = serverData.charts?.account ?? accountChartData
  const viewCenterChartData = serverData.charts?.center ?? centerChartData
  const viewProspectChartData = serverData.charts?.prospect ?? prospectChartData
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [exportScope, setExportScope] = useState<
    | { dataset: "accounts"; accountNames: string[] }
    | { dataset: "centers"; centerKeys: string[] }
    | { dataset: "prospects"; prospectIds: string[] }
    | null
  >(null)
  const [exportsDialogOpen, setExportsDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const canExport = canExportData(userRole)
  const accountVisibilityByName = useMemo<Record<string, AccountVisibilityInfo>>(
    () =>
      Object.fromEntries(
        accounts.map((account) => [
          account.account_global_legal_name,
          {
            visibility: account.account_visibility,
            note: account.account_visibility_note,
          },
        ])
      ),
    [accounts]
  )

  // Global search state
  const { setTheme, resolvedTheme } = useTheme()
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isSearching,
    isOpen: isSearchOpen,
    setIsOpen: setIsSearchOpen,
    handleOpen: handleSearchOpen,
    handleClose: handleSearchClose,
  } = useGlobalSearch({
    accounts: accountsEnabled ? accounts : [],
    centers: centersEnabled ? centers : [],
    prospects: prospectsEnabled ? prospects : [],
    aliases: accountsEnabled ? aliases : [],
    serverMode: true,
  })

  const {
    recentItems,
    recentSearches,
    addRecentItem,
    addRecentSearch,
    clearRecentItems,
  } = useRecentItems()

  const {
    favorites,
    favoriteKeys,
    toggleFavorite,
    addFavorites,
    removeFavorite,
    removeFavorites,
    clearFavorites,
  } = useFavorites()

  // Search-triggered detail dialogs (separate from tab-level dialogs)
  const [searchSelectedAccount, setSearchSelectedAccount] = useState<Account | null>(null)
  const [searchAccountDialogOpen, setSearchAccountDialogOpen] = useState(false)
  const [searchSelectedCenter, setSearchSelectedCenter] = useState<Center | null>(null)
  const [searchCenterDialogOpen, setSearchCenterDialogOpen] = useState(false)
  const [searchSelectedProspect, setSearchSelectedProspect] = useState<Prospect | null>(null)
  const [searchProspectDialogOpen, setSearchProspectDialogOpen] = useState(false)

  const hasTrackedDashboardLoadRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const currentScreenStartRef = useRef<number | null>(null)
  const currentScreenRef = useRef<"accounts" | "centers" | "prospects">(defaultSection)
  const previousPageRef = useRef<Record<"accounts" | "centers" | "prospects", number>>({
    accounts: 1,
    centers: 1,
    prospects: 1,
  })
  const previousAccountsViewRef = useRef<"chart" | "data" | "map">(accountsMapEnabled ? "map" : "chart")
  const previousCentersViewRef = useRef<"chart" | "data" | "map">("map")
  const previousProspectsViewRef = useRef<"chart" | "data">("chart")
  const viewSwitchCountRef = useRef(0)
  const exportCountRef = useRef(0)
  const exportScopeClearRef = useRef<number | null>(null)
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

  // Filters may be replaced with an equal object by the filter hook; reset pagination only on value changes.
  const filtersPaginationResetKey = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    setAccountsPage(1)
    setCentersPage(1)
    setProspectsPage(1)
  }, [filtersPaginationResetKey])

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
      filtered_accounts_count: filteredCounts.accounts,
      filtered_centers_count: filteredCounts.centers,
      filtered_prospects_count: filteredCounts.prospects,
      is_filtered: activeFiltersCount > 0,
    })
  }, [
    activeSection,
    currentScreenView,
    activeFiltersCount,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
    filteredCounts,
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
    currentScreenRef.current = defaultSection
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
  }, [authReady, userId, userEmail, captureCurrentScreenTime, defaultSection])

  useEffect(() => {
    const totalVisible =
      (accountsEnabled ? filteredCounts.accounts : 0) +
      (centersEnabled ? filteredCounts.centers : 0) +
      (prospectsEnabled ? filteredCounts.prospects : 0)
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
    filteredCounts,
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

  const pageLoading = serverData.initialLoading
  const pageError = serverData.summary ? null : serverData.error
  const pageConnectionStatus = "Loading your dashboard"

  useEffect(() => {
    if (!pageError) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.ERROR_STATE_SHOWN, {
      error_message: pageError,
    })
  }, [pageError])

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

  const dataLoaded = !pageLoading && !pageError

  const hasMapView =
    (activeSection === "accounts" && accountsMapEnabled && accountsView === "map") ||
    (activeSection === "centers" && centersEnabled && centersView === "map")
  const { startTour } = useProductTour({ userId, dataLoaded, hasMapView, isSidebarCollapsed })

  useEffect(() => {
    if (!dataLoaded || hasTrackedDashboardLoadRef.current) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.DASHBOARD_LOADED, {
      total_accounts_count: serverData.summary?.full.accounts ?? 0,
      total_centers_count: serverData.summary?.full.centers ?? 0,
      total_services_count: serverData.summary?.full.services ?? 0,
      total_prospects_count: serverData.summary?.full.prospects ?? 0,
    })

    hasTrackedDashboardLoadRef.current = true
  }, [dataLoaded, serverData.summary])

  // A refresh keeps the current filters, so when the warehouse data is
  // unchanged the re-render is pixel-identical. The spinner plus a completion
  // toast are the only signals that the click did anything.
  const refreshing = serverData.isRefreshing
  const refreshRequestedRef = useRef(false)

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    refreshRequestedRef.current = true
    serverData.reload()
  }, [serverData])

  useEffect(() => {
    if (refreshing || !refreshRequestedRef.current) return
    refreshRequestedRef.current = false
    toast.success('Data refreshed')
  }, [refreshing])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    serverData.reload()
  }, [serverData])

  // Cancel any pending deferred scope clear so a freshly opened export can't be
  // reset by a timer scheduled when the previous dialog closed.
  const cancelPendingScopeClear = useCallback(() => {
    if (exportScopeClearRef.current !== null) {
      window.clearTimeout(exportScopeClearRef.current)
      exportScopeClearRef.current = null
    }
  }, [])

  const handleExportAll = useCallback(() => {
    if (!canExport) {
      return
    }
    cancelPendingScopeClear()
    setExportScope(null)
    setExportDialogOpen(true)
  }, [canExport, cancelPendingScopeClear])

  const handleDownloadSelection = useCallback(
    (
      scope:
        | { dataset: "accounts"; accountNames: string[] }
        | { dataset: "centers"; centerKeys: string[] }
        | { dataset: "prospects"; prospectIds: string[] }
    ) => {
      const values =
        scope.dataset === "centers"
          ? scope.centerKeys
          : scope.dataset === "prospects"
            ? scope.prospectIds
            : scope.accountNames
      if (!canExport || values.length === 0) {
        return
      }
      cancelPendingScopeClear()
      setExportScope(scope)
      setExportDialogOpen(true)
    },
    [canExport, cancelPendingScopeClear]
  )

  const summaryCounts = useMemo(() => {
    const filtered = serverData.summary?.filtered
    const full = serverData.summary?.full
    return {
      filteredAccountsCount: filtered?.accounts ?? 0,
      totalAccountsCount: full?.accounts ?? 0,
      filteredCentersCount: filtered?.centers ?? 0,
      totalCentersCount: full?.centers ?? 0,
      filteredUpcomingCentersCount: filtered?.upcomingCenters ?? 0,
      totalUpcomingCentersCount: full?.upcomingCenters ?? 0,
      filteredProspectsCount: filtered?.prospects ?? 0,
      totalProspectsCount: full?.prospects ?? 0,
      filteredHeadcount: filtered?.headcount ?? 0,
      totalHeadcount: full?.headcount ?? 0,
    }
  }, [serverData.summary])

  const handleGenerateReport = useCallback(async () => {
    if (isGeneratingReport) return
    setIsGeneratingReport(true)
    try {
      // Fetch counts and every chart bucket for the applied filters directly.
      // The dashboard state may still be catching up (the fetch is debounced)
      // and its chart payload is capped (top 10, city "Others"). Both requests
      // use the same canonical wire filters as the dashboard so the figures
      // match the cards and hit the same cache.
      const wireFilters = normalizeFiltersForServer(filters, serverRanges)
      const [summaryRes, chartsRes] = await Promise.all([
        fetchDashboardSummary(wireFilters),
        fetchDashboardChartsFull(wireFilters),
      ])
      const counts = {
        filteredAccountsCount: summaryRes.filtered.accounts,
        totalAccountsCount: summaryRes.full.accounts,
        filteredCentersCount: summaryRes.filtered.centers,
        totalCentersCount: summaryRes.full.centers,
        filteredUpcomingCentersCount: summaryRes.filtered.upcomingCenters,
        totalUpcomingCentersCount: summaryRes.full.upcomingCenters,
        filteredProspectsCount: summaryRes.filtered.prospects,
        totalProspectsCount: summaryRes.full.prospects,
        filteredHeadcount: summaryRes.filtered.headcount,
        totalHeadcount: summaryRes.full.headcount,
      }
      const charts = {
        accounts: chartsRes.account,
        centers: chartsRes.center,
        prospects: { departmentData: chartsRes.prospect.departmentData, levelData: chartsRes.prospect.levelData },
      }
      const model = buildSummaryReport({
        filters,
        counts,
        baselineRanges: {
          revenue: revenueRange,
          yearsInIndia: yearsInIndiaRange,
          centerIncYear: centerIncYearRange,
        },
        enabledSections: {
          accounts: accountsEnabled,
          centers: centersEnabled,
          prospects: prospectsEnabled,
        },
        activeView: activeSection,
        activeFilterCount: activeFiltersCount,
        charts,
        generatedBy: userEmail ?? undefined,
      })
      const { downloadSummaryReportPdf } = await import("@/lib/reports/summary-report-pdf")
      await downloadSummaryReportPdf(model)
      toast.success("Summary PDF downloaded.")
      captureEvent(ANALYTICS_EVENTS.SUMMARY_REPORT_DOWNLOADED, {
        active_filters_count: activeFiltersCount,
        active_view: activeSection,
        metrics_count: model.metrics.length,
      })
    } catch (error) {
      devError("Summary report failed", error)
      toast.error("Could not generate the summary PDF. Please try again.")
      captureEvent(ANALYTICS_EVENTS.SUMMARY_REPORT_FAILED, {
        active_filters_count: activeFiltersCount,
      })
    } finally {
      setIsGeneratingReport(false)
    }
  }, [
    isGeneratingReport,
    filters,
    revenueRange,
    yearsInIndiaRange,
    centerIncYearRange,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
    activeSection,
    activeFiltersCount,
    serverRanges,
    userEmail,
  ])

  const handleExportDialogOpenChange = useCallback((open: boolean) => {
    setExportDialogOpen(open)
    if (!open) {
      // Defer clearing the scope until the close animation (300ms) finishes,
      // otherwise the dialog briefly re-renders in its full multi-dataset form.
      cancelPendingScopeClear()
      exportScopeClearRef.current = window.setTimeout(() => {
        exportScopeClearRef.current = null
        setExportScope(null)
      }, 350)
    }
  }, [cancelPendingScopeClear])

  useEffect(() => cancelPendingScopeClear, [cancelPendingScopeClear])

  const exportPayload = useMemo(() => {
    if (!exportScope) {
      // The client does not hold the filtered arrays (#249 Phase 4): the
      // server builds the export from the filter state, and the dialog shows
      // counts from the summary endpoint.
      return {
        data: { accounts: [], centers: [], services: [], prospects: [] },
        isFiltered: activeFiltersCount > 0,
        filtersSnapshot: filters,
        accountNames: null as string[] | null,
        centerKeys: null as string[] | null,
        prospectKeys: undefined as string[] | undefined,
        keylessProspectIds: undefined as string[] | undefined,
        allowedDatasets: undefined as ExportDatasetKey[] | undefined,
        filters: filters as unknown,
        rowCounts: {
          accounts: serverData.summary?.filtered.accounts ?? 0,
          centers: serverData.summary?.filtered.centers ?? 0,
          services: serverData.summary?.filtered.services ?? 0,
          prospects: serverData.summary?.filtered.prospects ?? 0,
        } as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    // A row selection exports only the selected entity's sheet, never the
    // related datasets. The dialog is locked to that single dataset; the
    // payload targets the selected keys directly and the dialog shows
    // selection-sized counts.
    const emptyData = { accounts: [], centers: [], services: [], prospects: [] }
    const snapshot = { ...(filters as object), selection: exportScope }

    if (exportScope.dataset === "centers") {
      return {
        data: emptyData,
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: [],
        centerKeys: exportScope.centerKeys,
        prospectKeys: undefined as string[] | undefined,
        keylessProspectIds: undefined as string[] | undefined,
        allowedDatasets: ["centers"] as ExportDatasetKey[],
        filters: undefined as unknown,
        rowCounts: { centers: exportScope.centerKeys.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    if (exportScope.dataset === "prospects") {
      // Selected record ids are ps_unique_key when the row has one; keyless
      // rows use the "account::name::discriminator" composite id (see
      // getProspectRecordId), which the server matches directly.
      return {
        data: emptyData,
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: [],
        centerKeys: [],
        prospectKeys: exportScope.prospectIds.filter((id) => !id.includes("::")),
        keylessProspectIds: exportScope.prospectIds.filter((id) => id.includes("::")),
        allowedDatasets: ["prospects"] as ExportDatasetKey[],
        filters: undefined as unknown,
        rowCounts: { prospects: exportScope.prospectIds.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    return {
      data: emptyData,
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: exportScope.accountNames,
      centerKeys: [],
      prospectKeys: undefined as string[] | undefined,
      keylessProspectIds: undefined as string[] | undefined,
      allowedDatasets: ["accounts"] as ExportDatasetKey[],
      filters: undefined as unknown,
      rowCounts: { accounts: exportScope.accountNames.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
    }
  }, [exportScope, filters, activeFiltersCount, serverData.summary])

  const handleExportCompleted = useCallback(() => {
    exportCountRef.current += 1
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((current) => !current)
  }, [])

  const handleSectionSelect = useCallback((section: "accounts" | "centers" | "prospects") => {
    if (!isSectionEnabled(section)) {
      toast.info(getSectionUnavailableMessage(section))
      return
    }
    setActiveSection(section)
  }, [])

  const handleSearchResultSelect = useCallback(
    (result: SearchResult) => {
      handleSearchClose()
      addRecentItem({
        type: result.type,
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
      })
      if (searchQuery.trim()) {
        addRecentSearch(searchQuery.trim())
      }
      captureEvent(ANALYTICS_EVENTS.SEARCH_RESULT_SELECTED, {
        result_type: result.type,
        query: searchQuery,
      })

      // Server results without a hydrated row (e.g. keyless prospects) cannot
      // open a detail dialog.
      if (!result.data) {
        toast.info("This record is not available right now.")
        return
      }

      if (result.type === "account") {
        setSearchSelectedAccount(result.data as Account)
        setSearchAccountDialogOpen(true)
      } else if (result.type === "center") {
        setSearchSelectedCenter(result.data as Center)
        setSearchCenterDialogOpen(true)
      } else if (result.type === "prospect") {
        setSearchSelectedProspect(result.data as Prospect)
        setSearchProspectDialogOpen(true)
      }
    },
    [handleSearchClose, addRecentItem, addRecentSearch, searchQuery]
  )

  const handleSearchRecentItemSelect = useCallback(
    (item: RecentItem) => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_RECENT_ITEM_SELECTED, {
        result_type: item.type,
      })

      // Fetch the record and open its dialog
      if (item.type === "account") {
        if (!accountsEnabled) {
          toast.info(getSectionUnavailableMessage("accounts"))
          return
        }
        fetchAccountRelated(item.id)
          .then((res) => {
            if (!res.account) return
            setSearchSelectedAccount(res.account)
            setSearchAccountDialogOpen(true)
          })
          .catch(() => toast.info("This account is not available right now."))
      } else if (item.type === "center") {
        if (!centersEnabled) {
          toast.info(getSectionUnavailableMessage("centers"))
          return
        }
        fetchCenterDetail(item.id)
          .then((res) => {
            setSearchSelectedCenter(res.center)
            setSearchCenterDialogOpen(true)
          })
          .catch(() => toast.info("This centre is not available right now."))
      } else if (item.type === "prospect") {
        if (!prospectsEnabled) {
          toast.info(getSectionUnavailableMessage("prospects"))
          return
        }
        fetchProspectById(item.id)
          .then((res) => {
            setSearchSelectedProspect(res.prospect)
            setSearchProspectDialogOpen(true)
          })
          .catch(() => toast.info("This prospect is not available right now."))
      }
    },
    [handleSearchClose, accountsEnabled, centersEnabled, prospectsEnabled]
  )

  const handleSearchRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchQuery(query)
    },
    [setSearchQuery]
  )

  const handleOpenFavorites = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.FAVORITES_VIEW_OPENED, { count: favorites.length })
    setFavoritesDialogOpen(true)
  }, [favorites.length])

  const handleToggleFavorite = useCallback(
    async (item: FavoriteInput) => {
      const result = await toggleFavorite(item)
      // null means a toggle for this item is already in flight; ignore it.
      if (!result) return
      if (!result.ok) {
        toast.error("Could not update favourites. Please try again.")
        return
      }
      toast.success(result.added ? "Added to favourites" : "Removed from favourites")
    },
    [toggleFavorite]
  )

  const handleFavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await addFavorites(items)
      if (!ok) {
        toast.error("Could not add to favourites. Please try again.")
        return
      }
      toast.success(`Added ${items.length} ${items.length === 1 ? "item" : "items"} to favourites`)
    },
    [addFavorites]
  )

  const handleRemoveFavorite = useCallback(
    async (item: FavoriteItem) => {
      const ok = await removeFavorite(item.entity_type, item.entity_id)
      toast[ok ? "success" : "error"](ok ? "Removed from favourites" : "Could not remove favourite. Please try again.")
    },
    [removeFavorite]
  )

  const handleUnfavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await removeFavorites(items)
      if (!ok) {
        toast.error("Could not remove from favourites. Please try again.")
        return
      }
      toast.success(`Removed ${items.length} ${items.length === 1 ? "item" : "items"} from favourites`)
    },
    [removeFavorites]
  )

  const handleClearFavorites = useCallback(async () => {
    const ok = await clearFavorites()
    toast[ok ? "success" : "error"](ok ? "Cleared all favourites" : "Could not clear favourites. Please try again.")
  }, [clearFavorites])

  const handleOpenFavorite = useCallback(
    (item: FavoriteItem) => {
      setFavoritesDialogOpen(false)
      if (item.entity_type === "account") {
        fetchAccountRelated(item.entity_id)
          .then((res) => {
            if (!res.account) return toast.info("This account is not available in the current dataset.")
            setSearchSelectedAccount(res.account)
            setSearchAccountDialogOpen(true)
          })
          .catch(() => toast.info("This account is not available in the current dataset."))
      } else if (item.entity_type === "center") {
        fetchCenterDetail(item.entity_id)
          .then((res) => {
            setSearchSelectedCenter(res.center)
            setSearchCenterDialogOpen(true)
          })
          .catch(() => toast.info("This centre is not available in the current dataset."))
      } else {
        fetchProspectById(item.entity_id)
          .then((res) => {
            setSearchSelectedProspect(res.prospect)
            setSearchProspectDialogOpen(true)
          })
          .catch(() => toast.info("This prospect is not available in the current dataset."))
      }
    },
    []
  )

  const handleSearchActionSelect = useCallback(
    (action: string) => {
      handleSearchClose()
      captureEvent(ANALYTICS_EVENTS.SEARCH_ACTION_SELECTED, { action })

      switch (action) {
        case "go-accounts":
          handleSectionSelect("accounts")
          break
        case "go-centers":
          handleSectionSelect("centers")
          break
        case "go-prospects":
          handleSectionSelect("prospects")
          break
        case "refresh":
          serverData.reload()
          break
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break
      }
    },
    [handleSearchClose, handleSectionSelect, serverData, setTheme, resolvedTheme]
  )

  useEffect(() => {
    if (!accountsMapEnabled && accountsView === "map") {
      setAccountsView("chart")
    }
  }, [accountsMapEnabled, accountsView])

  const handleSearchOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        captureEvent(ANALYTICS_EVENTS.SEARCH_OPENED, { trigger: "shortcut_or_button" })
      } else {
        captureEvent(ANALYTICS_EVENTS.SEARCH_CLOSED, { had_query: searchQuery.length > 0 })
      }
      setIsSearchOpen(open)
      if (!open) {
        setSearchQuery("")
      }
    },
    [setIsSearchOpen, setSearchQuery, searchQuery]
  )

  if (!authReady || !userId) {
    return null
  }

  if (pageLoading) {
    return <LoadingState connectionStatus={pageConnectionStatus} />
  }

  if (pageError) {
    return (
      <ErrorState
        error={pageError}
        onRetry={handleErrorRetry}
      />
    )
  }

  return (
    <div className="h-screen bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))] flex flex-col overflow-hidden">
      <TopProgressBar
        active={
          serverData.pending.core ||
          serverData.pending[activeSection] ||
          (dashboardViews.needCharts && serverData.pending.charts) ||
          (dashboardViews.needMap && serverData.pending.map)
        }
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow"
      >
        Skip to main content
      </a>
      <Header onRefresh={handleRefresh} refreshing={refreshing} onStartTour={startTour} onOpenSearch={handleSearchOpen} onOpenExports={() => setExportsDialogOpen(true)} onOpenHistory={() => setHistoryDialogOpen(true)} onOpenFavorites={handleOpenFavorites} />
      <ExportsDialog open={exportsDialogOpen} onOpenChange={setExportsDialogOpen} />
      <FavoritesDialog
        open={favoritesDialogOpen}
        onOpenChange={setFavoritesDialogOpen}
        favorites={favorites}
        onOpenFavorite={handleOpenFavorite}
        onRemove={handleRemoveFavorite}
        onClearAll={handleClearFavorites}
      />
      <HistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        recentItems={recentItems}
        onItemSelect={handleSearchRecentItemSelect}
        onClearHistory={clearRecentItems}
      />

      <GlobalSearch
        open={isSearchOpen}
        onOpenChange={handleSearchOpenChange}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={searchResults}
        isSearching={isSearching}
        recentItems={recentItems}
        recentSearches={recentSearches}
        onSelectResult={handleSearchResultSelect}
        onSelectRecentItem={handleSearchRecentItemSelect}
        onSelectRecentSearch={handleSearchRecentSearchSelect}
        onSelectAction={handleSearchActionSelect}
      />

      {/* Search-triggered detail dialogs */}
      {accountsEnabled && (
        <AccountDetailsDialog
          account={searchSelectedAccount}
          centers={centers}
          prospects={prospects}
          services={services}
          tech={tech}
          open={searchAccountDialogOpen}
          onOpenChange={setSearchAccountDialogOpen}
          fetchRelated
        />
      )}
      {centersEnabled && (
        <CenterDetailsDialog
          center={searchSelectedCenter}
          services={services}
          tech={tech}
          open={searchCenterDialogOpen}
          onOpenChange={setSearchCenterDialogOpen}
          fetchDetail
          onAccountOpen={(accountName) => {
            const openAccount = (account: Account) => {
              setSearchCenterDialogOpen(false)
              setSearchSelectedAccount(account)
              setSearchAccountDialogOpen(true)
            }
            fetchAccountRelated(accountName)
              .then((res) => res.account && openAccount(res.account))
              .catch(() => toast.info("This account is not available right now."))
          }}
        />
      )}
      {prospectsEnabled && (
        <ProspectDetailsDialog
          prospect={searchSelectedProspect}
          allProspects={prospects}
          open={searchProspectDialogOpen}
          onOpenChange={setSearchProspectDialogOpen}
          fetchRelated
          onAccountOpen={(accountName) => {
            const openAccount = (account: Account) => {
              setSearchProspectDialogOpen(false)
              setSearchSelectedAccount(account)
              setSearchAccountDialogOpen(true)
            }
            fetchAccountRelated(accountName)
              .then((res) => res.account && openAccount(res.account))
              .catch(() => toast.info("This account is not available right now."))
          }}
        />
      )}

      {dataLoaded && (
        <main
          id="main-content"
          className="flex flex-1 overflow-hidden [--dashboard-content-top-gap:1.5rem] [--dashboard-content-bottom-gap:0.75rem] [--dashboard-panel-height:calc(100dvh-18.75rem)]"
        >
          <ExportDialog
            open={exportDialogOpen}
            onOpenChange={handleExportDialogOpenChange}
            data={exportPayload.data}
            isFiltered={exportPayload.isFiltered}
            filtersSnapshot={exportPayload.filtersSnapshot}
            accountNames={exportPayload.accountNames}
            centerKeys={exportPayload.centerKeys}
            prospectKeys={exportPayload.prospectKeys}
            keylessProspectIds={exportPayload.keylessProspectIds}
            filters={exportPayload.filters}
            rowCounts={exportPayload.rowCounts}
            allowedDatasets={exportPayload.allowedDatasets}
            compact={Boolean(exportPayload.allowedDatasets)}
            onExportCompleted={handleExportCompleted}
          />
          <FiltersSidebar
            filters={filters}
            pendingFilters={pendingFilters}
            availableOptions={viewAvailableOptions}
            serverMode
            isApplying={isApplying}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            revenueRange={revenueRange}
            yearsInIndiaRange={yearsInIndiaRange}
            centerIncYearRange={centerIncYearRange}
            accountNames={accountNames}
            accountVisibilityByName={accountVisibilityByName}
            aliases={aliases}
            setPendingFilters={setPendingFilters}
            resetFilters={resetFilters}
            handleExportAll={handleExportAll}
            canExport={canExport}
            handleGenerateReport={handleGenerateReport}
            isGeneratingReport={isGeneratingReport}
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
                  {...summaryCounts}
                  activeView={activeSection}
                  onSelect={handleSectionSelect}
                  updating={serverData.pending.summary}
                />

                <Tabs value={activeSection} className="space-y-4" data-tour="tab-navigation">
                  {accountsEnabled && (
                    <AccountsTab
                      accounts={viewAccounts}
                      centers={NO_CENTERS}
                      prospects={NO_PROSPECTS}
                      services={NO_SERVICES}
                      tech={tech}
                      functions={functions}
                      server={accountsServerProps}
                      mapData={serverMapData}
                      chartsLoading={serverData.pending.charts}
                      mapLoading={serverData.pending.map}
                      accountChartData={viewAccountChartData}
                      chartLabelDisplay={chartLabelDisplay}
                      onChartLabelDisplayChange={setChartLabelDisplay}
                      accountsView={accountsView}
                      setAccountsView={setAccountsView}
                      currentPage={accountsPage}
                      setCurrentPage={setAccountsPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                      favoriteKeys={favoriteKeys}
                      onToggleFavorite={handleToggleFavorite}
                      onFavoriteMany={handleFavoriteMany}
                      onUnfavoriteMany={handleUnfavoriteMany}
                    />
                  )}

                  {centersEnabled && (
                    <CentersTab
                      accounts={NO_ACCOUNTS}
                      centers={viewCenters}
                      allCenters={centers}
                      prospects={NO_PROSPECTS}
                      functions={functions}
                      services={NO_SERVICES}
                      tech={tech}
                      server={centersServerProps}
                      mapData={serverMapData}
                      chartsLoading={serverData.pending.charts}
                      mapLoading={serverData.pending.map}
                      centerChartData={viewCenterChartData}
                      chartLabelDisplay={chartLabelDisplay}
                      onChartLabelDisplayChange={setChartLabelDisplay}
                      centersView={centersView}
                      setCentersView={setCentersView}
                      currentPage={centersPage}
                      setCurrentPage={setCentersPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                      favoriteKeys={favoriteKeys}
                      onToggleFavorite={handleToggleFavorite}
                      onFavoriteMany={handleFavoriteMany}
                      onUnfavoriteMany={handleUnfavoriteMany}
                    />
                  )}

                  {prospectsEnabled && (
                    <ProspectsTab
                      accounts={NO_ACCOUNTS}
                      centers={NO_CENTERS}
                      prospects={viewProspects}
                      allProspects={prospects}
                      services={NO_SERVICES}
                      tech={tech}
                      server={prospectsServerProps}
                      chartsLoading={serverData.pending.charts}
                      prospectChartData={viewProspectChartData}
                      chartLabelDisplay={chartLabelDisplay}
                      onChartLabelDisplayChange={setChartLabelDisplay}
                      prospectsView={prospectsView}
                      setProspectsView={setProspectsView}
                      currentPage={prospectsPage}
                      setCurrentPage={setProspectsPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                      favoriteKeys={favoriteKeys}
                      onToggleFavorite={handleToggleFavorite}
                      onFavoriteMany={handleFavoriteMany}
                      onUnfavoriteMany={handleUnfavoriteMany}
                    />
                  )}
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
