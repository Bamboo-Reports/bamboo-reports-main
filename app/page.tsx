"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { ExportDialog } from "@/components/export/export-dialog"
import { ExportsDialog } from "@/components/exports/exports-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"
import { FavoritesDialog } from "@/components/favorites/favorites-dialog"
import { FiltersSidebar } from "@/components/filters/filters-sidebar"
import { Header } from "@/components/layout/header"
import { GlobalSearch } from "@/components/search/global-search"
import dynamic from "next/dynamic"
const AccountDetailsDialog = dynamic(
  () => import("@/components/dialogs/account-details-tabbed-dialog").then((m) => m.AccountDetailsDialog),
  { ssr: false }
)
const CenterDetailsDialog = dynamic(
  () => import("@/components/dialogs/center-details-dialog").then((m) => m.CenterDetailsDialog),
  { ssr: false }
)
const ProspectDetailsDialog = dynamic(
  () => import("@/components/dialogs/prospect-details-dialog").then((m) => m.ProspectDetailsDialog),
  { ssr: false }
)
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
import { useFavorites } from "@/hooks/use-favorites"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { canExportData } from "@/lib/auth/roles"
import {
  canAccessAccountsMapView,
  getAccessibleDefaultSection,
  getSectionUnavailableMessage,
  isSectionEnabled,
} from "@/lib/config/dashboard-access"
import { useProductTour } from "@/hooks/use-product-tour"
import { useAnalytics } from "@/hooks/use-analytics"
import { useSearchHandlers } from "@/hooks/use-search-handlers"
import { useFavoriteHandlers } from "@/hooks/use-favorite-handlers"
import { buildExportPayload } from "@/lib/exports/payload-builder"
import { formatRevenueInMillions } from "@/lib/utils/helpers"
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
  })

  const { recentItems, recentSearches, addRecentItem, addRecentSearch, clearRecentItems } = useRecentItems()

  const { favorites, favoriteKeys, toggleFavorite, addFavorites, removeFavorite, removeFavorites, clearFavorites } =
    useFavorites()

  // Search-triggered detail dialogs (separate from tab-level dialogs)
  const [searchSelectedAccount, setSearchSelectedAccount] = useState<Account | null>(null)
  const [searchAccountDialogOpen, setSearchAccountDialogOpen] = useState(false)
  const [searchSelectedCenter, setSearchSelectedCenter] = useState<Center | null>(null)
  const [searchCenterDialogOpen, setSearchCenterDialogOpen] = useState(false)
  const [searchSelectedProspect, setSearchSelectedProspect] = useState<Prospect | null>(null)
  const [searchProspectDialogOpen, setSearchProspectDialogOpen] = useState(false)

  const exportScopeClearRef = useRef<number | null>(null)

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
    if (activeSection === "accounts") return accountsView
    if (activeSection === "centers") return centersView
    return prospectsView
  }, [activeSection, accountsView, centersView, prospectsView])

  const activePage = useMemo(() => {
    if (activeSection === "accounts") return accountsPage
    if (activeSection === "centers") return centersPage
    return prospectsPage
  }, [activeSection, accountsPage, centersPage, prospectsPage])

  const filtersPaginationResetKey = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    setAccountsPage(1)
    setCentersPage(1)
    setProspectsPage(1)
  }, [filtersPaginationResetKey])

  useEffect(() => {
    const storedSidebarState = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    if (storedSidebarState === "true") setIsSidebarCollapsed(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  const dataLoaded = !loading && !error

  const hasMapView =
    (activeSection === "accounts" && accountsMapEnabled && accountsView === "map") ||
    (activeSection === "centers" && centersEnabled && centersView === "map")
  const { startTour } = useProductTour({ userId, dataLoaded, hasMapView, isSidebarCollapsed })

  const handleRefresh = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.DATA_REFRESH_CLICKED)
    loadData(true)
  }, [loadData])

  const handleErrorRetry = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.ERROR_RETRY_CLICKED)
    loadData()
  }, [loadData])

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

  const handleExportDialogOpenChange = useCallback(
    (open: boolean) => {
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
    },
    [cancelPendingScopeClear]
  )

  useEffect(() => cancelPendingScopeClear, [cancelPendingScopeClear])

  const exportPayload = useMemo(
    () => buildExportPayload({ exportScope, filteredData, filters, activeFiltersCount }),
    [exportScope, filteredData, filters, activeFiltersCount]
  )

  const { exportCountRef } = useAnalytics({
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
    accountsCount: accounts.length,
    centersCount: centers.length,
    servicesCount: services.length,
    prospectsCount: prospects.length,
    filteredAccountsLength: filteredData.filteredAccounts.length,
    filteredCentersLength: filteredData.filteredCenters.length,
    filteredProspectsLength: filteredData.filteredProspects.length,
    loading,
    error,
    isSidebarCollapsed,
    isAccountsMapEnabled: accountsMapEnabled,
    filters,
    revenueRange,
    yearsInIndiaRange,
    centerIncYearRange,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
  })

  const handleExportCompleted = useCallback(() => {
    exportCountRef.current += 1
  }, [exportCountRef])

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

  const searchHandlersContext = {
    accounts,
    centers,
    prospects,
    accountsEnabled,
    centersEnabled,
    prospectsEnabled,
    searchQuery,
    handleSearchClose,
    handleSectionSelect,
    addRecentItem,
    addRecentSearch,
    setSearchQuery,
    setSearchSelectedAccount,
    setSearchAccountDialogOpen,
    setSearchSelectedCenter,
    setSearchCenterDialogOpen,
    setSearchSelectedProspect,
    setSearchProspectDialogOpen,
    loadData,
    setTheme,
    resolvedTheme,
  }

  const {
    handleSearchResultSelect,
    handleSearchRecentItemSelect,
    handleSearchRecentSearchSelect,
    handleSearchActionSelect,
  } = useSearchHandlers(searchHandlersContext)

  const favoriteHandlersContext = {
    accounts,
    centers,
    prospects,
    favorites,
    toggleFavorite,
    addFavorites,
    removeFavorite,
    removeFavorites,
    clearFavorites,
    setFavoritesDialogOpen,
    setSearchSelectedAccount,
    setSearchAccountDialogOpen,
    setSearchSelectedCenter,
    setSearchCenterDialogOpen,
    setSearchSelectedProspect,
    setSearchProspectDialogOpen,
  }

  const {
    handleOpenFavorites,
    handleToggleFavorite,
    handleFavoriteMany,
    handleRemoveFavorite,
    handleUnfavoriteMany,
    handleClearFavorites,
    handleOpenFavorite,
  } = useFavoriteHandlers(favoriteHandlersContext)

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
    return <ErrorState error={error} onRetry={handleErrorRetry} />
  }

  return (
    <div className="h-screen bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.14),_transparent_36%),radial-gradient(circle_at_0%_45%,_hsl(var(--chart-3)/0.10),_transparent_34%),hsl(var(--background))] flex flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow"
      >
        Skip to main content
      </a>
      <Header
        onRefresh={handleRefresh}
        onStartTour={startTour}
        onOpenSearch={handleSearchOpen}
        onOpenExports={() => setExportsDialogOpen(true)}
        onOpenHistory={() => setHistoryDialogOpen(true)}
        onOpenFavorites={handleOpenFavorites}
      />
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
        />
      )}
      {centersEnabled && (
        <CenterDetailsDialog
          center={searchSelectedCenter}
          services={services}
          tech={tech}
          open={searchCenterDialogOpen}
          onOpenChange={setSearchCenterDialogOpen}
          onAccountOpen={(accountName: string) => {
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
          onAccountOpen={(accountName: string) => {
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
            prospectKeys={exportPayload.prospectKeys}
            keylessProspectIds={exportPayload.keylessProspectIds}
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
                  filteredUpcomingCentersCount={
                    filteredData.filteredCenters.filter((c) => c.center_status === "Upcoming").length
                  }
                  totalUpcomingCentersCount={summary.totalUpcomingCentersCountFull}
                  filteredProspectsCount={filteredData.filteredProspects.length}
                  totalProspectsCount={summary.totalProspectsCountFull}
                  filteredHeadcount={filteredData.filteredCenters.reduce(
                    (sum, c) => sum + (c.center_employees ?? 0),
                    0
                  )}
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
                      favoriteKeys={favoriteKeys}
                      onToggleFavorite={handleToggleFavorite}
                      onFavoriteMany={handleFavoriteMany}
                      onUnfavoriteMany={handleUnfavoriteMany}
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
