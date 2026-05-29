"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { ExportDialog } from "@/components/export/export-dialog"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import { ExportsDialog } from "@/components/exports/exports-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"
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
import { useGlobalSearch } from "@/hooks/use-global-search"
import { useRecentItems } from "@/hooks/use-recent-items"
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

function DashboardContent(): React.JSX.Element | null {
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
  const [accountsView, setAccountsView] = useState<"chart" | "data" | "map">(accountsMapEnabled ? "map" : "chart")
  const [centersView, setCentersView] = useState<"chart" | "data" | "map">("map")
  const [prospectsView, setProspectsView] = useState<"chart" | "data">("chart")
  const [activeSection, setActiveSection] = useState<"accounts" | "centers" | "prospects">(defaultSection)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportScope, setExportScope] = useState<
    | { dataset: "accounts"; accountNames: string[] }
    | { dataset: "centers"; centerKeys: string[] }
    | { dataset: "prospects"; accountNames: string[] }
    | null
  >(null)
  const [exportsDialogOpen, setExportsDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
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
  })

  const {
    recentItems,
    recentSearches,
    addRecentItem,
    addRecentSearch,
    clearRecentItems,
  } = useRecentItems()

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
  const heartbeatIntervalRef = useRef<number | null>(null)
  const idleTimeoutRef = useRef<number | null>(null)
  const isIdleRef = useRef(false)
  const noResultsSignatureRef = useRef<string | null>(null)
  const previousSidebarCollapsedRef = useRef<boolean | null>(null)

  const activeFiltersCount = getTotalActiveFilters()
  const filteredLockedProspectTeasers = useMemo(() => {
    const visibleAccountNames = new Set(
      filteredData.filteredAccounts
        .map((account) => account.account_global_legal_name)
        .filter((name): name is string => Boolean(name))
    )

    return lockedProspectTeasers.filter((teaser) => visibleAccountNames.has(teaser.account_global_legal_name))
  }, [filteredData.filteredAccounts, lockedProspectTeasers])

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
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
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
  }, [authReady, userId, userEmail, captureCurrentScreenTime, defaultSection])

  useEffect(() => {
    const totalVisible =
      (accountsEnabled ? filteredData.filteredAccounts.length : 0) +
      (centersEnabled ? filteredData.filteredCenters.length : 0) +
      (prospectsEnabled ? filteredData.filteredProspects.length : 0)
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
    })
  }, [error])

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

  const dataLoaded = !loading && !error

  const hasMapView =
    (activeSection === "accounts" && accountsMapEnabled && accountsView === "map") ||
    (activeSection === "centers" && centersEnabled && centersView === "map")
  const { startTour } = useProductTour({ userId, dataLoaded, hasMapView, isSidebarCollapsed })

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
    loadData(true)
  }, [loadData])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    loadData()
  }, [loadData])

  const handleExportAll = useCallback(() => {
    if (!canExport) {
      return
    }
    setExportScope(null)
    setExportDialogOpen(true)
  }, [canExport])

  const handleDownloadSelection = useCallback(
    (
      scope:
        | { dataset: "accounts"; accountNames: string[] }
        | { dataset: "centers"; centerKeys: string[] }
        | { dataset: "prospects"; accountNames: string[] }
    ) => {
      const values = "accountNames" in scope ? scope.accountNames : scope.centerKeys
      if (!canExport || values.length === 0) {
        return
      }
      setExportScope(scope)
      setExportDialogOpen(true)
    },
    [canExport]
  )

  const handleExportDialogOpenChange = useCallback((open: boolean) => {
    setExportDialogOpen(open)
    if (!open) {
      // Defer clearing the scope until the close animation (300ms) finishes,
      // otherwise the dialog briefly re-renders in its full multi-dataset form.
      window.setTimeout(() => setExportScope(null), 350)
    }
  }, [])

  const exportPayload = useMemo(() => {
    const { filteredAccounts, filteredCenters, filteredServices, filteredProspects } = filteredData

    if (!exportScope) {
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
        allowedDatasets: undefined as ExportDatasetKey[] | undefined,
      }
    }

    // A row selection exports only the selected entity's sheet, never the
    // related datasets. The dialog is locked to that single dataset.
    const emptyData = { accounts: [], centers: [], services: [], prospects: [] }
    const snapshot = { ...(filters as object), selection: exportScope }

    if (exportScope.dataset === "centers") {
      const keySet = new Set(exportScope.centerKeys)
      const scopedCenters = filteredCenters.filter(
        (c) => c.cn_unique_key && keySet.has(c.cn_unique_key)
      )
      return {
        data: { ...emptyData, centers: scopedCenters },
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: [],
        centerKeys: exportScope.centerKeys,
        allowedDatasets: ["centers"] as ExportDatasetKey[],
      }
    }

    const nameSet = new Set(exportScope.accountNames)
    if (exportScope.dataset === "prospects") {
      const scopedProspects = filteredProspects.filter(
        (p) => p.account_global_legal_name && nameSet.has(p.account_global_legal_name)
      )
      return {
        data: { ...emptyData, prospects: scopedProspects },
        isFiltered: true,
        filtersSnapshot: snapshot,
        accountNames: exportScope.accountNames,
        centerKeys: [],
        allowedDatasets: ["prospects"] as ExportDatasetKey[],
      }
    }

    const scopedAccounts = filteredAccounts.filter(
      (a) => a.account_global_legal_name && nameSet.has(a.account_global_legal_name)
    )
    return {
      data: { ...emptyData, accounts: scopedAccounts },
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: exportScope.accountNames,
      centerKeys: [],
      allowedDatasets: ["accounts"] as ExportDatasetKey[],
    }
  }, [exportScope, filteredData, filters, activeFiltersCount])

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

      // Find the record in current data and open dialog
      if (item.type === "account") {
        if (!accountsEnabled) {
          toast.info(getSectionUnavailableMessage("accounts"))
          return
        }
        const account = accounts.find((a) => a.account_global_legal_name === item.id)
        if (account) {
          setSearchSelectedAccount(account)
          setSearchAccountDialogOpen(true)
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
        }
      }
    },
    [handleSearchClose, accounts, centers, prospects, accountsEnabled, centersEnabled, prospectsEnabled]
  )

  const handleSearchRecentSearchSelect = useCallback(
    (query: string) => {
      setSearchQuery(query)
    },
    [setSearchQuery]
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
          loadData()
          break
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break
      }
    },
    [handleSearchClose, handleSectionSelect, loadData, setTheme, resolvedTheme]
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

  if (loading) {
    return <LoadingState connectionStatus={connectionStatus} />
  }

  if (error) {
    return (
      <ErrorState
        error={error}
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
      <Header onRefresh={handleRefresh} onStartTour={startTour} onOpenSearch={handleSearchOpen} onOpenExports={() => setExportsDialogOpen(true)} onOpenHistory={() => setHistoryDialogOpen(true)} />
      <ExportsDialog open={exportsDialogOpen} onOpenChange={setExportsDialogOpen} />
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
        />
      )}
      {centersEnabled && (
        <CenterDetailsDialog
          center={searchSelectedCenter}
          services={services}
          tech={tech}
          open={searchCenterDialogOpen}
          onOpenChange={setSearchCenterDialogOpen}
          onAccountOpen={(accountName) => {
            const account = accounts.find((item) => item.account_global_legal_name === accountName)
            if (!account) return
            setSearchCenterDialogOpen(false)
            setSearchSelectedAccount(account)
            setSearchAccountDialogOpen(true)
          }}
        />
      )}
      {prospectsEnabled && (
        <ProspectDetailsDialog
          prospect={searchSelectedProspect}
          allProspects={prospects}
          open={searchProspectDialogOpen}
          onOpenChange={setSearchProspectDialogOpen}
          onAccountOpen={(accountName) => {
            const account = accounts.find((item) => item.account_global_legal_name === accountName)
            if (!account) return
            setSearchProspectDialogOpen(false)
            setSearchSelectedAccount(account)
            setSearchAccountDialogOpen(true)
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
            allowedDatasets={exportPayload.allowedDatasets}
            compact={Boolean(exportPayload.allowedDatasets)}
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
                  filteredAccountsCount={filteredData.filteredAccounts.length}
                  totalAccountsCount={summary.totalAccountsCountFull}
                  filteredCentersCount={filteredData.filteredCenters.length}
                  totalCentersCount={summary.totalCentersCountFull}
                  filteredUpcomingCentersCount={filteredData.filteredCenters.filter((c) => c.center_status === "Upcoming").length}
                  totalUpcomingCentersCount={summary.totalUpcomingCentersCountFull}
                  filteredProspectsCount={filteredData.filteredProspects.length}
                  totalProspectsCount={summary.totalProspectsCountFull}
                  filteredHeadcount={filteredData.filteredCenters.reduce((sum, c) => sum + (c.center_employees ?? 0), 0)}
                  totalHeadcount={summary.totalHeadcountFull}
                  activeView={activeSection}
                  onSelect={handleSectionSelect}
                />

                <Tabs value={activeSection} className="space-y-4" data-tour="tab-navigation">
                  {accountsEnabled && (
                    <AccountsTab
                      accounts={filteredData.filteredAccounts}
                      centers={filteredData.filteredCenters}
                      prospects={filteredData.filteredProspects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      services={filteredData.filteredServices}
                      tech={tech}
                      functions={functions}
                      accountChartData={accountChartData}
                      accountsView={accountsView}
                      setAccountsView={setAccountsView}
                      currentPage={accountsPage}
                      setCurrentPage={setAccountsPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                    />
                  )}

                  {centersEnabled && (
                    <CentersTab
                      accounts={filteredData.filteredAccounts}
                      centers={filteredData.filteredCenters}
                      allCenters={centers}
                      prospects={filteredData.filteredProspects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      functions={functions}
                      services={filteredData.filteredServices}
                      tech={tech}
                      centerChartData={centerChartData}
                      centersView={centersView}
                      setCentersView={setCentersView}
                      currentPage={centersPage}
                      setCurrentPage={setCentersPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                    />
                  )}

                  {prospectsEnabled && (
                    <ProspectsTab
                      accounts={filteredData.filteredAccounts}
                      centers={filteredData.filteredCenters}
                      prospects={filteredData.filteredProspects}
                      allProspects={prospects}
                      lockedProspectTeasers={filteredLockedProspectTeasers}
                      services={filteredData.filteredServices}
                      tech={tech}
                      prospectChartData={prospectChartData}
                      prospectsView={prospectsView}
                      setProspectsView={setProspectsView}
                      currentPage={prospectsPage}
                      setCurrentPage={setProspectsPage}
                      itemsPerPage={itemsPerPage}
                      onRecordOpened={addRecentItem}
                      onDownloadSelection={canExport ? handleDownloadSelection : undefined}
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
