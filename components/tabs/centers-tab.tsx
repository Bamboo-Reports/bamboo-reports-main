"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, PieChartIcon, Table as TableIcon, MapIcon, LayoutGrid, Layers, MapPin } from "lucide-react"
import { CenterRow } from "@/components/tables"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useTableRowSelection } from "@/hooks/use-table-row-selection"
import type { FavoriteInput } from "@/hooks/use-favorites"
import { CenterGridCard } from "@/components/cards/center-grid-card"
import { PieChartCard } from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { getPaginatedData, formatCenterLocation } from "@/lib/utils/helpers"
import { CentersMap } from "@/components/maps/centers-map"
import { CentersChoroplethMap } from "@/components/maps/centers-choropleth-map"
import { MapErrorBoundary } from "@/components/maps/map-error-boundary"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { SortButton } from "@/components/ui/sort-button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { TableColumnMenu } from "@/components/tables/table-column-menu"
import { useTableColumnPreferences } from "@/hooks/use-table-column-preferences"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { fetchAccountRelated, type CityAggregate, type StateAggregate } from "@/lib/dashboard/api-client"
import { devError } from "@/lib/utils/dev-log"
import type { TabServerProps } from "@/components/tabs/accounts-tab"
import type { Account, Center, Function, LockedProspectTeaser, Prospect, Service, Tech } from "@/lib/types"

interface CentersTabProps {
  accounts: Account[]
  centers: Center[]
  allCenters: Center[]
  prospects: Prospect[]
  lockedProspectTeasers: LockedProspectTeaser[]
  functions: Function[]
  services: Service[]
  tech: Tech[]
  centerChartData: {
    centerTypeData: Array<{ name: string; value: number; fill?: string }>
    employeesRangeData: Array<{ name: string; value: number; fill?: string }>
    cityData: Array<{ name: string; value: number; fill?: string }>
    functionData: Array<{ name: string; value: number; fill?: string }>
  }
  centersView: "chart" | "data" | "map"
  setCentersView: (view: "chart" | "data" | "map") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  onRecordOpened?: (item: { type: "center" | "account"; id: string; title: string; subtitle: string }) => void
  onDownloadSelection?: (scope: { dataset: "centers"; centerKeys: string[] }) => void
  favoriteKeys?: Set<string>
  onToggleFavorite?: (item: FavoriteInput) => void
  onFavoriteMany?: (items: FavoriteInput[]) => void
  onUnfavoriteMany?: (items: FavoriteInput[]) => void
  server?: TabServerProps | null
  mapData?: { cities: CityAggregate[]; states: StateAggregate[]; scaleStates?: StateAggregate[] | null } | null
}

// Module-level so the references are stable across renders (passed to memo'd rows).
const getCenterKey = (center: Center) => center.cn_unique_key ?? ""

function buildCenterFavorite(center: Center): FavoriteInput {
  return {
    entity_type: "center",
    entity_id: center.cn_unique_key ?? "",
    title: center.center_name || "Unknown Center",
    subtitle: formatCenterLocation(center.center_city, center.center_state) || center.account_global_legal_name || null,
  }
}

export function CentersTab({
  accounts,
  centers,
  allCenters,
  prospects,
  lockedProspectTeasers,
  services,
  tech,
  centerChartData,
  centersView,
  setCentersView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  onRecordOpened,
  onDownloadSelection,
  favoriteKeys,
  onToggleFavorite,
  onFavoriteMany,
  onUnfavoriteMany,
  server,
  mapData,
}: CentersTabProps) {
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "type" | "employees"
    direction: "asc" | "desc" | null
  }>({
    key: "name",
    direction: null,
  })
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const [mapMode, setMapMode] = useState<"city" | "state">("state")
  const {
    columns,
    visibleColumnSet,
    isColumnVisible,
    setColumnVisible,
    resetColumns,
  } = useTableColumnPreferences("centers")
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [currentPage])
  const previousDataLayoutRef = React.useRef<"table" | "grid">("table")
  const previousMapModeRef = React.useRef<"city" | "state">("state")
  const openedRecordRef = React.useRef<{
    recordId: string
    openedAt: number
    openedFrom: "table_row" | "grid_card"
    center: Center
  } | null>(null)
  const handleCenterClick = React.useCallback((center: Center, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "center",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
    }
    setSelectedCenter(center)
    setIsDialogOpen(true)
    openedRecordRef.current = {
      recordId: center.cn_unique_key,
      openedAt: Date.now(),
      openedFrom,
      center,
    }
    onRecordOpened?.({
      type: "center",
      id: center.cn_unique_key ?? "",
      title: center.center_name ?? "Unknown Center",
      subtitle: formatCenterLocation(center.center_city, center.center_state),
    })
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "center",
      record_id: center.cn_unique_key,
      record_label: center.center_name ?? "Unknown Center",
      source_view: centersView,
      source_layout: centersView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_center_key: Boolean(center.cn_unique_key),
    })
  }, [isDialogOpen, onRecordOpened, centersView, dataLayout])

  const openAccount = (account: Account) => {
    setIsDialogOpen(false)
    setSelectedAccount(account)
    setIsAccountDialogOpen(true)
    onRecordOpened?.({
      type: "account",
      id: account.account_global_legal_name,
      title: account.account_global_legal_name,
      subtitle: [account.account_hq_city, account.account_hq_country].filter(Boolean).join(", "),
    })
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "account",
      record_id: account.account_global_legal_name,
      record_label: account.account_global_legal_name,
      source_view: "center_details",
      source_layout: centersView === "data" ? dataLayout : null,
      opened_from: "related_account_link",
      has_website: Boolean(account.account_hq_website),
    })
  }

  const handleAccountOpen = (accountName: string) => {
    const account = accounts.find((item) => item.account_global_legal_name === accountName)
    if (account) {
      openAccount(account)
      return
    }
    // Server mode: the account is not in the current page rows; fetch it.
    if (server) {
      fetchAccountRelated(accountName)
        .then((res) => {
          if (res.account) openAccount(res.account)
        })
        .catch((err) => devError("related account fetch failed:", err))
    }
  }

  const handleSort = (key: typeof sort.key) => {
    let nextDirection: "asc" | "desc" | null = "asc"
    setSort((prev) => {
      if (prev.key !== key || prev.direction === null) {
        nextDirection = "asc"
        return { key, direction: "asc" }
      }
      if (prev.direction === "asc") {
        nextDirection = "desc"
        return { key, direction: "desc" }
      }
      nextDirection = null
      return { key, direction: null }
    })
    captureEvent(ANALYTICS_EVENTS.SORT_CHANGED, {
      entity: "center",
      sort_key: key,
      sort_direction: nextDirection ?? "none",
    })
    server?.onSortChange(key, nextDirection)
    setCurrentPage(1)
  }

  React.useEffect(() => {
    if (previousDataLayoutRef.current === dataLayout) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.DATA_LAYOUT_CHANGED, {
      screen: "centers",
      data_layout: dataLayout,
    })

    previousDataLayoutRef.current = dataLayout
  }, [dataLayout])

  React.useEffect(() => {
    if (previousMapModeRef.current === mapMode) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.MAP_MODE_CHANGED, {
      screen: "centers",
      map_mode: mapMode,
    })

    previousMapModeRef.current = mapMode
  }, [mapMode])

  React.useEffect(() => {
    if (isDialogOpen || !openedRecordRef.current) {
      return
    }

    const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
    captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
      entity: "center",
      record_id: openedRecordRef.current.recordId,
      dwell_seconds: dwellSeconds,
      close_reason: "dialog_closed",
    })
    openedRecordRef.current = null
  }, [isDialogOpen])


  const sortedCenters = React.useMemo(() => {
    // Server mode: rows arrive already sorted and paginated.
    if (server || !sort.direction) return centers

    const compare = (a: string | undefined | null, b: string | undefined | null) =>
      (a || "").localeCompare(b || "", undefined, { sensitivity: "base" })

    const getValue = (center: Center) => {
      switch (sort.key) {
        case "name":
          return center.center_name
        case "location":
          return formatCenterLocation(center.center_city, center.center_state)
        case "type":
          return center.center_type
        case "employees":
          return center.center_employees_range
        default:
          return ""
      }
    }

    const sorted = [...centers].sort((a, b) => compare(getValue(a), getValue(b)))
    return sort.direction === "asc" ? sorted : sorted.reverse()
  }, [centers, sort, server])

  const pageCenters = React.useMemo(
    () => (server ? sortedCenters : getPaginatedData(sortedCenters, currentPage, itemsPerPage)),
    [server, sortedCenters, currentPage, itemsPerPage]
  )
  const {
    selected: selectedKeys,
    toggleMany,
    clear: clearSelection,
    pageKeys,
    allPageSelected,
    somePageSelected,
    allSelectedFavorited,
    selectedFavoriteInputs,
    handleRowSelectChange,
    handleRowToggleFavorite,
  } = useTableRowSelection({
    items: server ? pageCenters : centers,
    pageItems: pageCenters,
    getKey: getCenterKey,
    favoritePrefix: "center",
    favoriteKeys,
    buildFavorite: buildCenterFavorite,
    onToggleFavorite,
  })

  // Tab-specific open handler kept stable so memo'd rows don't re-render.
  const handleRowOpen = React.useCallback(
    (center: Center) => handleCenterClick(center, "table_row"),
    [handleCenterClick]
  )

  // Show empty state when no centers
  if (server ? server.total === 0 && !server.loading : centers.length === 0) {
    return (
      <TabsContent value="centers">
        <EmptyState type="no-results" />
      </TabsContent>
    )
  }

  return (
    <TabsContent value="centers">
      {/* Header with View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="h-5 w-5 text-[hsl(var(--chart-2))]" />
        <h2 className="text-lg font-semibold text-foreground">Center Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
          value={centersView}
          onValueChange={(value) => setCentersView(value as "chart" | "data" | "map")}
          options={[
            {
              value: "chart",
              label: <span className="text-[hsl(var(--chart-1))]">Charts</span>,
              icon: (
                <PieChartIcon className="h-4 w-4 text-[hsl(var(--chart-1))]" />
              ),
            },
            {
              value: "map",
              label: <span className="text-[hsl(var(--chart-4))]">Map</span>,
              icon: (
                <MapIcon className="h-4 w-4 text-[hsl(var(--chart-4))]" />
              ),
            },
            {
              value: "data",
              label: <span className="text-[hsl(var(--chart-2))]">Data</span>,
              icon: (
                <TableIcon className="h-4 w-4 text-[hsl(var(--chart-2))]" />
              ),
            },
          ]}
          className="ml-auto"
        />
      </div>

      {/* Charts Section */}
      {centersView === "chart" && (
        <div className="w-full mb-6 view-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Center Type"
              data={centerChartData.centerTypeData}
              countLabel="Total Centers"
              showBigPercentage
            />
            <PieChartCard
              title="Center Headcount"
              data={centerChartData.employeesRangeData}
              countLabel="Total Centers"
              showBigPercentage
            />
            <PieChartCard
              title="City"
              data={centerChartData.cityData}
              countLabel="Total Centers"
              showBigPercentage
            />
            <PieChartCard
              title="Function"
              data={centerChartData.functionData}
              countLabel="Total Centers"
              showBigPercentage
            />
          </div>
        </div>
      )}

      {/* Map Section */}
       {centersView === "map" && (
         <Card data-tour="map-view" className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex items-center gap-3">
               <CardTitle className="text-base">Centers Map</CardTitle>
               <ViewSwitcher
                 value={mapMode}
                 onValueChange={(value) => setMapMode(value as "city" | "state")}
                 options={[
                   {
                     value: "city",
                     label: <span className="text-[hsl(var(--chart-4))]">City</span>,
                     icon: <MapPin className="h-4 w-4 text-[hsl(var(--chart-4))]" />,
                   },
                   {
                     value: "state",
                     label: <span className="text-[hsl(var(--chart-3))]">State</span>,
                     icon: <Layers className="h-4 w-4 text-[hsl(var(--chart-3))]" />,
                   },
                 ]}
                 className="ml-auto"
               />
             </div>
           </CardHeader>
           <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
             <MapErrorBoundary>
               {mapMode === "city" ? (
                 <CentersMap centers={centers} cities={mapData?.cities} heightClass="h-full" />
               ) : (
                 <CentersChoroplethMap
                   centers={centers}
                   allCenters={allCenters}
                   states={mapData?.states}
                   scaleStates={mapData?.scaleStates}
                   heightClass="h-full"
                 />
               )}
             </MapErrorBoundary>
           </CardContent>
         </Card>
       )}

       {/* Data Table */}
       {centersView === "data" && (
         <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex flex-wrap items-center gap-3">
               <CardTitle className="text-base">Centers Data</CardTitle>
               <div className="ml-auto flex items-center gap-2">
                 {dataLayout === "table" && (
                   <TableColumnMenu
                     columns={columns}
                     visibleColumnSet={visibleColumnSet}
                     onToggleColumn={setColumnVisible}
                     onReset={resetColumns}
                   />
                 )}
                 <ViewSwitcher
                   value={dataLayout}
                   onValueChange={(value) => setDataLayout(value as "table" | "grid")}
                   options={[
                     {
                       value: "table",
                       label: <span className="text-[hsl(var(--chart-2))]">Table</span>,
                       icon: (
                         <TableIcon className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                       ),
                     },
                     {
                       value: "grid",
                       label: <span className="text-[hsl(var(--chart-3))]">Grid</span>,
                       icon: (
                         <LayoutGrid className="h-4 w-4 text-[hsl(var(--chart-3))]" />
                       ),
                     },
                   ]}
                 />
               </div>
             </div>
           </CardHeader>
            <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
              <div ref={scrollContainerRef} key={dataLayout} className="flex-1 overflow-auto view-content">
                {dataLayout === "table" ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[44px]">
                          <Checkbox
                            checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => toggleMany(pageKeys, checked === true)}
                            aria-label="Select all centers on this page"
                          />
                        </TableHead>
                        {isColumnVisible("name") && (
                        <TableHead className="w-[260px]">
                          <SortButton label="Center Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("location") && (
                        <TableHead className="w-[200px]">
                          <SortButton label="Location" sortKey="location" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("type") && (
                        <TableHead className="w-[200px]">
                          <SortButton label="Center Type" sortKey="type" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("employees") && (
                        <TableHead className="w-[160px]">
                          <SortButton label="Center Headcount" sortKey="employees" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageCenters.map(
                        (center) => (
                          <CenterRow
                            key={center.cn_unique_key}
                            center={center}
                            onOpen={handleRowOpen}
                            visibleColumns={visibleColumnSet}
                            selectable
                            isSelected={selectedKeys.has(center.cn_unique_key ?? "")}
                            onSelectChange={getCenterKey(center) ? handleRowSelectChange : undefined}
                            isFavorite={favoriteKeys?.has(`center:${center.cn_unique_key ?? ""}`)}
                            onToggleFavorite={onToggleFavorite && getCenterKey(center) ? handleRowToggleFavorite : undefined}
                          />
                        )
                      )}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 px-6 py-3 border-b bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground">Sort</span>
                      <button
                        type="button"
                        onClick={() => handleSort("name")}
                        className="inline-flex items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 shadow-sm transition-colors h-7 w-7"
                        aria-label="Sort by center name"
                      >
                        {sort.key !== "name" || sort.direction === null ? (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : sort.direction === "asc" ? (
                          <ArrowUpAZ className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ArrowDownAZ className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                      {pageCenters.map(
                        (center) => (
                          <CenterGridCard
                            key={center.cn_unique_key}
                            center={center}
                            onClick={() => handleCenterClick(center, "grid_card")}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
                  {(server ? server.total : centers.length) > 0 && (
                    <PaginationControls
                      currentPage={currentPage}
                      totalItems={server ? server.total : centers.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      dataLength={server ? server.total : centers.length}
                    />
                  )}
            </CardContent>
         </Card>
       )}

      {/* Center Details Dialog */}
      <CenterDetailsDialog
        center={selectedCenter}
        services={services}
        tech={tech}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAccountOpen={handleAccountOpen}
        fetchDetail={Boolean(server)}
      />

      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={prospects}
        lockedProspectTeasers={lockedProspectTeasers}
        services={services}
        tech={tech}
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        fetchRelated={Boolean(server)}
      />

      <SelectionActionBar
        show={centersView === "data" && selectedKeys.size > 0}
        count={selectedKeys.size}
        onClear={clearSelection}
        onExport={() => onDownloadSelection?.({ dataset: "centers", centerKeys: Array.from(selectedKeys) })}
        onFavorite={
          onFavoriteMany || onUnfavoriteMany
            ? () => {
                const items = selectedFavoriteInputs()
                if (allSelectedFavorited) onUnfavoriteMany?.(items)
                else onFavoriteMany?.(items)
              }
            : undefined
        }
        favoriteActive={allSelectedFavorited}
      />
    </TabsContent>
  )
}
