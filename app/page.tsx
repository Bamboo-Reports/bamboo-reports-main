"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ExportDialog } from "@/components/export/export-dialog"
import { ExportsDialog } from "@/components/exports/exports-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"
import { FiltersSidebar } from "@/components/filters/filters-sidebar"
import { Header } from "@/components/layout/header"
import { GlobalSearch } from "@/components/search/global-search"
import { SearchRecordDialogs } from "@/components/dashboard/search-record-dialogs"
import { ErrorState } from "@/components/states/error-state"
import { LoadingState } from "@/components/states/loading-state"
import { AccountsTab, CentersTab } from "@/components/tabs"
import { ProspectsTab } from "@/components/tabs/prospects-tab"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { TopProgressBar } from "@/components/ui/top-progress-bar"
import { Tabs } from "@/components/ui/tabs"
import { RecordHistoryProvider } from "@/contexts/record-history-context"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useDashboardAnalytics } from "@/hooks/use-dashboard-analytics"
import { useDashboardExport } from "@/hooks/use-dashboard-export"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import { useDashboardLayout } from "@/hooks/use-dashboard-layout"
import { useDashboardRefresh } from "@/hooks/use-dashboard-refresh"
import { useDashboardSearch } from "@/hooks/use-dashboard-search"
import { useEntityTableProps } from "@/hooks/use-entity-table-props"
import { useProductTour } from "@/hooks/use-product-tour"
import { useServerDashboardData } from "@/hooks/use-server-dashboard-data"
import { useSummaryReport } from "@/hooks/use-summary-report"
import { canExportData } from "@/lib/auth/roles"
import type { FacetRanges } from "@/lib/dashboard/api-client"
import {
  NO_ACCOUNTS,
  NO_ALIASES,
  NO_CENTERS,
  NO_FUNCTIONS,
  NO_PROSPECTS,
  NO_SERVICES,
  NO_TECH,
} from "@/lib/dashboard/empty-datasets"

function DashboardContent(): React.JSX.Element | null {
  const { authReady, userId, userEmail, userRole } = useAuthGuard()

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
    handleRevenueRangeChange,
    handleYearsInIndiaRangeChange,
    handleCenterIncYearRangeChange,
    getTotalActiveFilters,
  } = useDashboardFilters({
    accounts: NO_ACCOUNTS,
    centers: NO_CENTERS,
    functions: NO_FUNCTIONS,
    services: NO_SERVICES,
    prospects: NO_PROSPECTS,
    tech: NO_TECH,
    serverRanges,
  })

  // Filters may be replaced with an equal object by the filter hook; reset pagination only on value changes.
  const filtersPaginationResetKey = useMemo(() => JSON.stringify(filters), [filters])

  const layout = useDashboardLayout({ filtersKey: filtersPaginationResetKey })
  const {
    activeSection,
    setActiveSection,
    accountsView,
    setAccountsView,
    centersView,
    setCentersView,
    prospectsView,
    setProspectsView,
    activeView,
    hasMapView,
    chartLabelDisplay,
    setChartLabelDisplay,
    accountsPage,
    setAccountsPage,
    centersPage,
    setCentersPage,
    prospectsPage,
    setProspectsPage,
    activePage,
    itemsPerPage,
    setItemsPerPage,
    entitySorts,
    isSidebarCollapsed,
    toggleSidebar: handleToggleSidebar,
  } = layout

  // What is visible right now, so charts/map/rows fetch lazily (#249 perf).
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
    sorts: entitySorts,
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

  const {
    accounts: accountsServerProps,
    centers: centersServerProps,
    prospects: prospectsServerProps,
  } = useEntityTableProps(serverData, layout, filtersPaginationResetKey)
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
  const [exportsDialogOpen, setExportsDialogOpen] = useState(false)
  const handleOpenExports = useCallback(() => setExportsDialogOpen(true), [])
  const canExport = canExportData(userRole)

  const activeFiltersCount = getTotalActiveFilters()
  const pageLoading = serverData.initialLoading
  const pageError = serverData.summary ? null : serverData.error
  const dataLoaded = !pageLoading && !pageError

  const reportRanges = useMemo(
    () => ({ revenue: revenueRange, yearsInIndia: yearsInIndiaRange, centerIncYear: centerIncYearRange }),
    [revenueRange, yearsInIndiaRange, centerIncYearRange]
  )
  const { trackExportCompleted } = useDashboardAnalytics({
    authReady,
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
    ranges: reportRanges,
    summary: serverData.summary,
    pageError,
    dataLoaded,
  })

  const { startTour } = useProductTour({ userId, dataLoaded, hasMapView, isSidebarCollapsed })

  const { refreshing, handleRefresh, handleErrorRetry } = useDashboardRefresh(serverData, filtersPaginationResetKey)

  const {
    dialogProps: exportDialogProps,
    openFullExport,
    handleExportAll,
    handleDownloadSelection,
    describeFilterFields,
  } = useDashboardExport({
    canExport,
    filters,
    activeFiltersCount,
    summary: serverData.summary,
    ranges: reportRanges,
    onExportCompleted: trackExportCompleted,
  })
  const { isGeneratingReport, handleGenerateReport } = useSummaryReport({
    filters,
    serverRanges,
    ranges: reportRanges,
    activeSection,
    activeFiltersCount,
    userEmail,
  })

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

  const { openSearch, openHistory, addRecentItem, searchProps, historyProps, recordDialogs } = useDashboardSearch({
    currentScreenView: activeView,
    onSectionSelect: setActiveSection,
    onReload: serverData.reload,
  })

  if (!authReady || !userId) {
    return null
  }

  if (pageLoading) {
    return <LoadingState />
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
    <RecordHistoryProvider recordOpened={addRecentItem}>
    <div className="h-screen bg-background flex flex-col overflow-hidden">
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
      <Header onRefresh={handleRefresh} refreshing={refreshing} onOpenSearch={openSearch} />
      <ExportsDialog open={exportsDialogOpen} onOpenChange={setExportsDialogOpen} describeFilters={describeFilterFields} />
      <HistoryDialog {...historyProps} />
      <GlobalSearch {...searchProps} />
      <SearchRecordDialogs dialogs={recordDialogs} />

      {dataLoaded && (
        // The map and data panels end level with the filters sidebar. Their height is
        // the viewport minus everything stacked above them: header (64px + 1px border),
        // top gap (1.5rem), summary cards (5rem), their margin (1.5rem), the
        // "analytics" heading row (2.5rem), its margin (1rem), and the bottom gap
        // (0.75rem). Update this when any of those change.
        <main
          id="main-content"
          className="flex flex-1 overflow-hidden [--dashboard-content-top-gap:1.5rem] [--dashboard-content-bottom-gap:0.75rem] [--dashboard-panel-height:calc(100dvh-65px-var(--dashboard-content-top-gap)-5rem-1.5rem-2.5rem-1rem-var(--dashboard-content-bottom-gap))]"
        >
          <ExportDialog {...exportDialogProps} />
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
            aliases={NO_ALIASES}
            setPendingFilters={setPendingFilters}
            resetFilters={resetFilters}
            handleExportAll={handleExportAll}
            canExport={canExport}
            handleGenerateReport={handleGenerateReport}
            isGeneratingReport={isGeneratingReport}
            handleRevenueRangeChange={handleRevenueRangeChange}
            handleYearsInIndiaRangeChange={handleYearsInIndiaRangeChange}
            handleCenterIncYearRangeChange={handleCenterIncYearRangeChange}
            handleLoadSavedFilters={handleLoadSavedFilters}
            onStartTour={startTour}
            onOpenExports={handleOpenExports}
            onOpenHistory={openHistory}
          />

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-gutter-stable">
              <div className="px-6 pt-[var(--dashboard-content-top-gap)] pb-[var(--dashboard-content-bottom-gap)]">
                <SummaryCards
                  {...summaryCounts}
                  activeView={activeSection}
                  onSelect={setActiveSection}
                  updating={serverData.pending.summary}
                />

                <Tabs value={activeSection} className="space-y-4" data-tour="tab-navigation">
                  <AccountsTab
                    accounts={viewAccounts}
                    centers={NO_CENTERS}
                    prospects={NO_PROSPECTS}
                    services={NO_SERVICES}
                    tech={NO_TECH}
                    functions={NO_FUNCTIONS}
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
                    setItemsPerPage={setItemsPerPage}
                    onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                    onExportAll={canExport ? openFullExport : undefined}
                  />

                  <CentersTab
                    accounts={NO_ACCOUNTS}
                    centers={viewCenters}
                    allCenters={NO_CENTERS}
                    prospects={NO_PROSPECTS}
                    functions={NO_FUNCTIONS}
                    services={NO_SERVICES}
                    tech={NO_TECH}
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
                    setItemsPerPage={setItemsPerPage}
                    onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                    onExportAll={canExport ? openFullExport : undefined}
                  />

                  <ProspectsTab
                    accounts={NO_ACCOUNTS}
                    centers={NO_CENTERS}
                    prospects={viewProspects}
                    allProspects={NO_PROSPECTS}
                    services={NO_SERVICES}
                    tech={NO_TECH}
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
                    setItemsPerPage={setItemsPerPage}
                    onDownloadSelection={canExport ? handleDownloadSelection : undefined}
                    onExportAll={canExport ? openFullExport : undefined}
                  />
                </Tabs>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
    </RecordHistoryProvider>
  )
}

export default DashboardContent
