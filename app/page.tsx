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
import { ErrorState } from "@/components/states/error-state"
import { LoadingState } from "@/components/states/loading-state"
import { AccountsTab, CentersTab } from "@/components/tabs"
import { ProspectsTab } from "@/components/tabs/prospects-tab"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { Tabs } from "@/components/ui/tabs"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useDashboardData } from "@/hooks/use-dashboard-data"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import { useServerDashboardData } from "@/hooks/use-server-dashboard-data"
import { isServerDashboardEnabled } from "@/lib/config/server-dashboard"
import {
  fetchAccountRelated,
  fetchCenterDetail,
  fetchProspectById,
  type EntitySort,
  type FacetRanges,
} from "@/lib/dashboard/api-client"
import { useGlobalSearch } from "@/hooks/use-global-search"
import { useRecentItems } from "@/hooks/use-recent-items"
import { useFavorites, type FavoriteItem, type FavoriteInput } from "@/hooks/use-favorites"
import { getProspectRecordId } from "@/lib/dashboard/prospect-id"
import { countsTowardHeadcount } from "@/lib/dashboard/headcount"
import {
  captureEvent,
  ensureAnalyticsSession,
  identifyUser,
  setAnalyticsContext,
} from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
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
import type { Account, Center, Prospect } from "@/lib/types"
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

function DashboardContent(): React.JSX.Element | null {
  const serverMode = isServerDashboardEnabled()
  const accountsEnabled = isSectionEnabled("accounts")
  const centersEnabled = isSectionEnabled("centers")
  const prospectsEnabled = isSectionEnabled("prospects")
  const defaultSection = getAccessibleDefaultSection()
  const accountsMapEnabled = canAccessAccountsMapView()
  const { authReady, userId, userEmail, userRole } = useAuthGuard()

  const {
    accounts,
    centers,
    functions,
    services,
    tech,
    prospects,
    aliases,
    lockedProspectTeasers,
    summary,
    loading,
    error,
    connectionStatus,
    loadData,
  } = useDashboardData({ enabled: authReady && !!userId && !serverMode })

  // Server mode: base slider ranges come from the facets endpoint (set once
  // it responds); the filters hook skips its data-derived range mechanics.
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
    serverRanges: serverMode ? serverRanges : null,
  })

  const [accountsPage, setAccountsPage] = useState(1)
  const [centersPage, setCentersPage] = useState(1)
  const [prospectsPage, setProspectsPage] = useState(1)
  const itemsPerPage = 51

  // Server mode: per-entity sort state (the tabs report sort changes here).
  const [accountsSort, setAccountsSort] = useState<EntitySort | null>(null)
  const [centersSort, setCentersSort] = useState<EntitySort | null>(null)
  const [prospectsSort, setProspectsSort] = useState<EntitySort | null>(null)

  const serverData = useServerDashboardData({
    enabled: serverMode && authReady && !!userId,
    filters,
    pages: { accounts: accountsPage, centers: centersPage, prospects: prospectsPage },
    sorts: { accounts: accountsSort, centers: centersSort, prospects: prospectsSort },
    pageSize: itemsPerPage,
  })

  useEffect(() => {
    if (serverData.facets) setServerRanges(serverData.facets.ranges)
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
      serverMode
        ? {
            total: serverData.entityPages.accounts?.total ?? 0,
            loading: serverData.entityPages.accounts === null,
            onSortChange: makeSortHandler("accounts", setAccountsSort),
          }
        : null,
    [serverMode, serverData.entityPages.accounts, makeSortHandler]
  )
  const centersServerProps = useMemo(
    () =>
      serverMode
        ? {
            total: serverData.entityPages.centers?.total ?? 0,
            loading: serverData.entityPages.centers === null,
            onSortChange: makeSortHandler("centers", setCentersSort),
          }
        : null,
    [serverMode, serverData.entityPages.centers, makeSortHandler]
  )
  const prospectsServerProps = useMemo(
    () =>
      serverMode
        ? {
            total: serverData.entityPages.prospects?.total ?? 0,
            loading: serverData.entityPages.prospects === null,
            onSortChange: makeSortHandler("prospects", setProspectsSort),
          }
        : null,
    [serverMode, serverData.entityPages.prospects, makeSortHandler]
  )
  const serverMapData = useMemo(
    () =>
      serverMode && serverData.map
        ? { cities: serverData.map.cities, states: serverData.map.states, scaleStates: serverData.scaleStates }
        : null,
    [serverMode, serverData.map, serverData.scaleStates]
  )

  // Effective per-view data: server pages or the client filter engine output.
  const viewAccounts = serverMode ? (serverData.entityPages.accounts?.rows ?? []) : filteredData.filteredAccounts
  const viewCenters = serverMode ? (serverData.entityPages.centers?.rows ?? []) : filteredData.filteredCenters
  const viewProspects = serverMode ? (serverData.entityPages.prospects?.rows ?? []) : filteredData.filteredProspects
  const filteredCounts = useMemo(
    () =>
      serverMode
        ? {
            accounts: serverData.summary?.filtered.accounts ?? 0,
            centers: serverData.summary?.filtered.centers ?? 0,
            prospects: serverData.summary?.filtered.prospects ?? 0,
          }
        : {
            accounts: filteredData.filteredAccounts.length,
            centers: filteredData.filteredCenters.length,
            prospects: filteredData.filteredProspects.length,
          },
    [serverMode, serverData.summary, filteredData]
  )
  const viewAvailableOptions = serverMode ? (serverData.facets?.options ?? availableOptions) : availableOptions
  const viewAccountChartData = serverMode ? (serverData.charts?.account ?? accountChartData) : accountChartData
  const viewCenterChartData = serverMode ? (serverData.charts?.center ?? centerChartData) : centerChartData
  const viewProspectChartData = serverMode ? (serverData.charts?.prospect ?? prospectChartData) : prospectChartData
  const [accountsView, setAccountsView] = useState<"chart" | "data" | "map">(accountsMapEnabled ? "map" : "chart")
  const [centersView, setCentersView] = useState<"chart" | "data" | "map">("map")
  const [prospectsView, setProspectsView] = useState<"chart" | "data">("chart")
  const [activeSection, setActiveSection] = useState<"accounts" | "centers" | "prospects">(defaultSection)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
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
    isOpen: isSearchOpen,
    setIsOpen: setIsSearchOpen,
    handleOpen: handleSearchOpen,
    handleClose: handleSearchClose,
  } = useGlobalSearch({
    accounts: accountsEnabled ? accounts : [],
    centers: centersEnabled ? centers : [],
    prospects: prospectsEnabled ? prospects : [],
    aliases: accountsEnabled ? aliases : [],
    serverMode,
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
  const filteredLockedProspectTeasers = useMemo(() => {
    // Server mode: the per-account prospect limit is disabled in this
    // deployment, so there are no teasers to thread through.
    if (serverMode) return []
    const visibleAccountNames = new Set(
      filteredData.filteredAccounts
        .map((account) => account.account_global_legal_name)
        .filter((name): name is string => Boolean(name))
    )

    return lockedProspectTeasers.filter((teaser) => visibleAccountNames.has(teaser.account_global_legal_name))
  }, [serverMode, filteredData.filteredAccounts, lockedProspectTeasers])

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

  const pageLoading = serverMode ? serverData.initialLoading : loading
  const pageError = serverMode ? (serverData.summary ? null : serverData.error) : error
  const pageConnectionStatus = serverMode ? "Loading data from database..." : connectionStatus

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
      total_accounts_count: serverMode ? (serverData.summary?.full.accounts ?? 0) : accounts.length,
      total_centers_count: serverMode ? (serverData.summary?.full.centers ?? 0) : centers.length,
      total_services_count: services.length,
      total_prospects_count: serverMode ? (serverData.summary?.full.prospects ?? 0) : prospects.length,
    })

    hasTrackedDashboardLoadRef.current = true
  }, [dataLoaded, serverMode, serverData.summary, accounts.length, centers.length, services.length, prospects.length])

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    if (serverMode) {
      serverData.reload()
      return
    }
    loadData(true)
  }, [serverMode, serverData, loadData])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    if (serverMode) {
      serverData.reload()
      return
    }
    loadData()
  }, [serverMode, serverData, loadData])

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
    const { filteredAccounts, filteredCenters, filteredServices, filteredProspects } = filteredData

    if (!exportScope) {
      // Server mode (#249 Phase 4): the client no longer holds the filtered
      // arrays; the server builds the export from the filter state, and the
      // dialog displays counts from the summary endpoint.
      if (serverMode) {
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
      return {
        data: {
          accounts: filteredAccounts,
          centers: filteredCenters,
          services: filteredServices,
          prospects: filteredProspects,
        },
        isFiltered: activeFiltersCount > 0,
        filtersSnapshot: filters,
        accountNames: Array.from(
          new Set(
            filteredAccounts
              .map((a) => a.account_global_legal_name)
              .filter((name): name is string => Boolean(name))
          )
        ),
        centerKeys: Array.from(
          new Set(
            filteredCenters
              .map((c) => c.cn_unique_key)
              .filter((key): key is string => Boolean(key))
          )
        ),
        prospectKeys: undefined as string[] | undefined,
        keylessProspectIds: undefined as string[] | undefined,
        allowedDatasets: undefined as ExportDatasetKey[] | undefined,
        filters: undefined as unknown,
        rowCounts: undefined as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    // A row selection exports only the selected entity's sheet, never the
    // related datasets. The dialog is locked to that single dataset. In server
    // mode the filtered arrays are empty, so the payload targets the selected
    // keys directly and the dialog shows selection-sized counts.
    const emptyData = { accounts: [], centers: [], services: [], prospects: [] }
    const snapshot = { ...(filters as object), selection: exportScope }

    if (exportScope.dataset === "centers") {
      const keySet = new Set(exportScope.centerKeys)
      const scopedCenters = serverMode
        ? []
        : filteredCenters.filter((c) => c.cn_unique_key && keySet.has(c.cn_unique_key))
      return {
        data: { ...emptyData, centers: scopedCenters },
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: [],
        centerKeys: exportScope.centerKeys,
        prospectKeys: undefined as string[] | undefined,
        keylessProspectIds: undefined as string[] | undefined,
        allowedDatasets: ["centers"] as ExportDatasetKey[],
        filters: undefined as unknown,
        rowCounts: (serverMode
          ? { centers: exportScope.centerKeys.length }
          : undefined) as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    if (exportScope.dataset === "prospects") {
      if (serverMode) {
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
      // Match the exact prospects the user selected (by stable record id), then
      // target them server-side via ps_unique_key. Selected prospects without a
      // key fall back to their account so they are still included.
      const idSet = new Set(exportScope.prospectIds)
      const scopedProspects = filteredProspects.filter((p) => idSet.has(getProspectRecordId(p)))
      const prospectKeys = Array.from(
        new Set(
          scopedProspects
            .map((p) => p.ps_unique_key)
            .filter((key): key is string => Boolean(key))
        )
      )
      const fallbackAccountNames = Array.from(
        new Set(
          scopedProspects
            .filter((p) => !p.ps_unique_key)
            .map((p) => p.account_global_legal_name)
            .filter((name): name is string => Boolean(name))
        )
      )
      const keylessProspectIds = Array.from(
        new Set(
          scopedProspects
            .filter((p) => !p.ps_unique_key)
            .map(getProspectRecordId)
        )
      )
      return {
        data: { ...emptyData, prospects: scopedProspects },
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: keylessProspectIds.length > 0 ? [] : fallbackAccountNames,
        centerKeys: [],
        prospectKeys,
        keylessProspectIds,
        allowedDatasets: ["prospects"] as ExportDatasetKey[],
        filters: undefined as unknown,
        rowCounts: undefined as Partial<Record<ExportDatasetKey, number>> | undefined,
      }
    }

    const nameSet = new Set(exportScope.accountNames)
    const scopedAccounts = serverMode
      ? []
      : filteredAccounts.filter(
          (a) => a.account_global_legal_name && nameSet.has(a.account_global_legal_name)
        )
    return {
      data: { ...emptyData, accounts: scopedAccounts },
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: exportScope.accountNames,
      centerKeys: [],
      prospectKeys: undefined as string[] | undefined,
      keylessProspectIds: undefined as string[] | undefined,
      allowedDatasets: ["accounts"] as ExportDatasetKey[],
      filters: undefined as unknown,
      rowCounts: (serverMode
        ? { accounts: exportScope.accountNames.length }
        : undefined) as Partial<Record<ExportDatasetKey, number>> | undefined,
    }
  }, [exportScope, filteredData, filters, activeFiltersCount, serverMode, serverData.summary])

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

      // Find the record in current data (or fetch it in server mode) and open dialog
      if (item.type === "account") {
        if (!accountsEnabled) {
          toast.info(getSectionUnavailableMessage("accounts"))
          return
        }
        const account = accounts.find((a) => a.account_global_legal_name === item.id)
        if (account) {
          setSearchSelectedAccount(account)
          setSearchAccountDialogOpen(true)
        } else if (serverMode) {
          fetchAccountRelated(item.id)
            .then((res) => {
              if (!res.account) return
              setSearchSelectedAccount(res.account)
              setSearchAccountDialogOpen(true)
            })
            .catch(() => toast.info("This account is not available right now."))
        }
      } else if (item.type === "center") {
        if (!centersEnabled) {
          toast.info(getSectionUnavailableMessage("centers"))
          return
        }
        const center = centers.find((c) => c.cn_unique_key === item.id)
        if (center) {
          setSearchSelectedCenter(center)
          setSearchCenterDialogOpen(true)
        } else if (serverMode) {
          fetchCenterDetail(item.id)
            .then((res) => {
              setSearchSelectedCenter(res.center)
              setSearchCenterDialogOpen(true)
            })
            .catch(() => toast.info("This center is not available right now."))
        }
      } else if (item.type === "prospect") {
        if (!prospectsEnabled) {
          toast.info(getSectionUnavailableMessage("prospects"))
          return
        }
        const prospect = prospects.find(
          (p) => `${p.account_global_legal_name}::${p.prospect_full_name ?? `${p.prospect_first_name ?? ""} ${p.prospect_last_name ?? ""}`.trim()}` === item.id
        )
        if (prospect) {
          setSearchSelectedProspect(prospect)
          setSearchProspectDialogOpen(true)
        } else if (serverMode) {
          fetchProspectById(item.id)
            .then((res) => {
              setSearchSelectedProspect(res.prospect)
              setSearchProspectDialogOpen(true)
            })
            .catch(() => toast.info("This prospect is not available right now."))
        }
      }
    },
    [handleSearchClose, serverMode, accounts, centers, prospects, accountsEnabled, centersEnabled, prospectsEnabled]
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
        toast.error("Could not update favorites. Please try again.")
        return
      }
      toast.success(result.added ? "Added to favorites" : "Removed from favorites")
    },
    [toggleFavorite]
  )

  const handleFavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await addFavorites(items)
      if (!ok) {
        toast.error("Could not add to favorites. Please try again.")
        return
      }
      toast.success(`Added ${items.length} ${items.length === 1 ? "item" : "items"} to favorites`)
    },
    [addFavorites]
  )

  const handleRemoveFavorite = useCallback(
    async (item: FavoriteItem) => {
      const ok = await removeFavorite(item.entity_type, item.entity_id)
      toast[ok ? "success" : "error"](ok ? "Removed from favorites" : "Could not remove favorite. Please try again.")
    },
    [removeFavorite]
  )

  const handleUnfavoriteMany = useCallback(
    async (items: FavoriteInput[]) => {
      if (items.length === 0) return
      const ok = await removeFavorites(items)
      if (!ok) {
        toast.error("Could not remove from favorites. Please try again.")
        return
      }
      toast.success(`Removed ${items.length} ${items.length === 1 ? "item" : "items"} from favorites`)
    },
    [removeFavorites]
  )

  const handleClearFavorites = useCallback(async () => {
    const ok = await clearFavorites()
    toast[ok ? "success" : "error"](ok ? "Cleared all favorites" : "Could not clear favorites. Please try again.")
  }, [clearFavorites])

  const handleOpenFavorite = useCallback(
    (item: FavoriteItem) => {
      setFavoritesDialogOpen(false)
      if (item.entity_type === "account") {
        const account = accounts.find((a) => a.account_global_legal_name === item.entity_id)
        if (account) {
          setSearchSelectedAccount(account)
          setSearchAccountDialogOpen(true)
          return
        }
        if (!serverMode) return toast.info("This account is not available in the current dataset.")
        fetchAccountRelated(item.entity_id)
          .then((res) => {
            if (!res.account) return toast.info("This account is not available in the current dataset.")
            setSearchSelectedAccount(res.account)
            setSearchAccountDialogOpen(true)
          })
          .catch(() => toast.info("This account is not available in the current dataset."))
      } else if (item.entity_type === "center") {
        const center = centers.find((c) => c.cn_unique_key === item.entity_id)
        if (center) {
          setSearchSelectedCenter(center)
          setSearchCenterDialogOpen(true)
          return
        }
        if (!serverMode) return toast.info("This center is not available in the current dataset.")
        fetchCenterDetail(item.entity_id)
          .then((res) => {
            setSearchSelectedCenter(res.center)
            setSearchCenterDialogOpen(true)
          })
          .catch(() => toast.info("This center is not available in the current dataset."))
      } else {
        const prospect = prospects.find((p) => getProspectRecordId(p) === item.entity_id)
        if (prospect) {
          setSearchSelectedProspect(prospect)
          setSearchProspectDialogOpen(true)
          return
        }
        if (!serverMode) return toast.info("This prospect is not available in the current dataset.")
        fetchProspectById(item.entity_id)
          .then((res) => {
            setSearchSelectedProspect(res.prospect)
            setSearchProspectDialogOpen(true)
          })
          .catch(() => toast.info("This prospect is not available in the current dataset."))
      }
    },
    [serverMode, accounts, centers, prospects]
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
          if (serverMode) serverData.reload()
          else loadData()
          break
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break
      }
    },
    [handleSearchClose, handleSectionSelect, serverMode, serverData, loadData, setTheme, resolvedTheme]
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow"
      >
        Skip to main content
      </a>
      <Header onRefresh={handleRefresh} onStartTour={startTour} onOpenSearch={handleSearchOpen} onOpenExports={() => setExportsDialogOpen(true)} onOpenHistory={() => setHistoryDialogOpen(true)} onOpenFavorites={handleOpenFavorites} />
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
          lockedProspectTeasers={lockedProspectTeasers}
          services={services}
          tech={tech}
          open={searchAccountDialogOpen}
          onOpenChange={setSearchAccountDialogOpen}
          fetchRelated={serverMode}
        />
      )}
      {centersEnabled && (
        <CenterDetailsDialog
          center={searchSelectedCenter}
          services={services}
          tech={tech}
          open={searchCenterDialogOpen}
          onOpenChange={setSearchCenterDialogOpen}
          fetchDetail={serverMode}
          onAccountOpen={(accountName) => {
            const openAccount = (account: Account) => {
              setSearchCenterDialogOpen(false)
              setSearchSelectedAccount(account)
              setSearchAccountDialogOpen(true)
            }
            const account = accounts.find((item) => item.account_global_legal_name === accountName)
            if (account) return openAccount(account)
            if (!serverMode) return
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
          fetchRelated={serverMode}
          onAccountOpen={(accountName) => {
            const openAccount = (account: Account) => {
              setSearchProspectDialogOpen(false)
              setSearchSelectedAccount(account)
              setSearchAccountDialogOpen(true)
            }
            const account = accounts.find((item) => item.account_global_legal_name === accountName)
            if (account) return openAccount(account)
            if (!serverMode) return
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
            lockedProspectsCount={filteredLockedProspectTeasers.length}
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
            serverMode={serverMode}
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
                  filteredAccountsCount={filteredCounts.accounts}
                  totalAccountsCount={serverMode ? (serverData.summary?.full.accounts ?? 0) : summary.totalAccountsCountFull}
                  filteredCentersCount={filteredCounts.centers}
                  totalCentersCount={serverMode ? (serverData.summary?.full.centers ?? 0) : summary.totalCentersCountFull}
                  filteredUpcomingCentersCount={
                    serverMode
                      ? (serverData.summary?.filtered.upcomingCenters ?? 0)
                      : filteredData.filteredCenters.filter((c) => c.center_status === "Upcoming").length
                  }
                  totalUpcomingCentersCount={serverMode ? (serverData.summary?.full.upcomingCenters ?? 0) : summary.totalUpcomingCentersCountFull}
                  filteredProspectsCount={filteredCounts.prospects}
                  totalProspectsCount={serverMode ? (serverData.summary?.full.prospects ?? 0) : summary.totalProspectsCountFull}
                  filteredHeadcount={
                    serverMode
                      ? (serverData.summary?.filtered.headcount ?? 0)
                      : filteredData.filteredCenters.reduce((sum, c) => sum + (countsTowardHeadcount(c.center_type) ? (c.center_employees ?? 0) : 0), 0)
                  }
                  totalHeadcount={serverMode ? (serverData.summary?.full.headcount ?? 0) : summary.totalHeadcountFull}
                  activeView={activeSection}
                  onSelect={handleSectionSelect}
                />

                <Tabs value={activeSection} className="space-y-4" data-tour="tab-navigation">
                  {accountsEnabled && (
                    <AccountsTab
                      accounts={viewAccounts}
                      centers={filteredData.filteredCenters}
                      prospects={filteredData.filteredProspects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      services={filteredData.filteredServices}
                      tech={tech}
                      functions={functions}
                      server={accountsServerProps}
                      mapData={serverMapData}
                      accountChartData={viewAccountChartData}
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
                      accounts={filteredData.filteredAccounts}
                      centers={viewCenters}
                      allCenters={centers}
                      prospects={filteredData.filteredProspects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      functions={functions}
                      services={filteredData.filteredServices}
                      tech={tech}
                      server={centersServerProps}
                      mapData={serverMapData}
                      centerChartData={viewCenterChartData}
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
                      accounts={filteredData.filteredAccounts}
                      centers={filteredData.filteredCenters}
                      prospects={viewProspects}
                      allProspects={prospects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      services={filteredData.filteredServices}
                      tech={tech}
                      server={prospectsServerProps}
                      prospectChartData={viewProspectChartData}
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
