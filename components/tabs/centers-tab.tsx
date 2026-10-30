"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { RiLayoutGridLine, RiMapLine, RiMapPinLine, RiPieChartLine, RiStackLine, RiTableLine } from "@remixicon/react"
import { CenterRowMenu, centerColumns, getCenterKey } from "@/components/tables/center-columns"
import { DataGridSortBar, DataTable, DataTablePagination } from "@/components/tables/data-table"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useDataTable } from "@/components/tables/use-data-table"
import { useRecordOpener } from "@/hooks/use-record-opener"
import { CenterGridCard } from "@/components/cards/center-grid-card"
import {
  PieChartCard,
  type PieChartLabelDisplay,
} from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { CentersMap } from "@/components/maps/centers-map"
import { CentersChoroplethMap } from "@/components/maps/centers-choropleth-map"
import { MapErrorBoundary } from "@/components/maps/map-error-boundary"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { TableColumnMenu } from "@/components/tables/table-column-menu"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { fetchAccountRelated, type CityAggregate, type StateAggregate } from "@/lib/dashboard/api-client"
import type { TabServerProps } from "@/components/tabs/accounts-tab"
import { GridSkeletonCards, MapUpdatingPill } from "@/components/ui/data-skeletons"
import type { Account, Center, Function, Prospect, Service, Tech } from "@/lib/types"

interface CentersTabProps {
  accounts: Account[]
  centers: Center[]
  allCenters: Center[]
  prospects: Prospect[]
  functions: Function[]
  services: Service[]
  tech: Tech[]
  centerChartData: {
    centerTypeData: Array<{ name: string; value: number; fill?: string }>
    employeesRangeData: Array<{ name: string; value: number; fill?: string }>
    cityData: Array<{ name: string; value: number; fill?: string }>
    functionData: Array<{ name: string; value: number; fill?: string }>
  }
  chartLabelDisplay: PieChartLabelDisplay
  onChartLabelDisplayChange: (display: PieChartLabelDisplay) => void
  centersView: "chart" | "data" | "map"
  setCentersView: (view: "chart" | "data" | "map") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  setItemsPerPage: (size: number) => void
  onDownloadSelection?: (scope: { dataset: "centers"; centerKeys: string[] }) => void
  server?: TabServerProps | null
  mapData?: { cities: CityAggregate[]; states: StateAggregate[]; scaleStates?: StateAggregate[] | null } | null
  chartsLoading?: boolean
  mapLoading?: boolean
}


export function CentersTab({
  accounts,
  centers,
  allCenters,
  prospects,
  services,
  tech,
  centerChartData,
  chartLabelDisplay,
  onChartLabelDisplayChange,
  centersView,
  setCentersView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  onDownloadSelection,
  server,
  mapData,
  chartsLoading = false,
  mapLoading = false,
}: CentersTabProps) {
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false)
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const [mapMode, setMapMode] = useState<"city" | "state">("state")
  const {
    table,
    totalRows,
    selectedKeys,
    clearSelection,
    columnPreferences: { columns, visibleColumnSet, setColumnVisible, resetColumns },
  } = useDataTable({
    dataset: "centers",
    data: centers,
    columns: centerColumns,
    getRowKey: getCenterKey,
    server,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  })
  const pageCenters = table.getRowModel().rows.map((row) => row.original)
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
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "center",
      record_id: center.cn_unique_key,
      record_label: center.center_name ?? "Unknown Centre",
      source_view: centersView,
      source_layout: centersView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_center_key: Boolean(center.cn_unique_key),
    })
  }, [isDialogOpen, centersView, dataLayout])

  const openAccount = (account: Account) => {
    setIsDialogOpen(false)
    setSelectedAccount(account)
    setIsAccountDialogOpen(true)
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

  const openRecord = useRecordOpener()
  const handleAccountOpen = (accountName: string) => {
    const account = accounts.find((item) => item.account_global_legal_name === accountName)
    if (account) {
      openAccount(account)
      return
    }
    // Server mode: the account is not in the current page rows; fetch it.
    if (server) {
      openRecord({
        label: "account",
        load: () => fetchAccountRelated(accountName).then((res) => res.account),
        onLoaded: openAccount,
        notFoundMessage: "This account could not be found.",
        errorMessage: "This account is not available right now.",
      })
    }
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
        <RiPieChartLine className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Centre Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
          value={centersView}
          onValueChange={(value) => setCentersView(value as "chart" | "data" | "map")}
          options={[
            {
              value: "chart",
              label: "Charts",
              icon: (
                <RiPieChartLine className="h-4 w-4" />
              ),
            },
            {
              value: "map",
              label: "Map",
              icon: (
                <RiMapLine className="h-4 w-4" />
              ),
            },
            {
              value: "data",
              label: "Data",
              icon: (
                <RiTableLine className="h-4 w-4" />
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
              title="Centre Type"
              data={centerChartData.centerTypeData}
              countLabel="Total Centres"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="Centre Headcount"
              data={centerChartData.employeesRangeData}
              countLabel="Total Centres"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="City"
              data={centerChartData.cityData}
              countLabel="Total Centres"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="Function"
              data={centerChartData.functionData}
              countLabel="Total Centres"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
          </div>
        </div>
      )}

      {/* Map Section */}
       {centersView === "map" && (
         <Card data-tour="map-view" className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex items-center gap-3">
               <CardTitle className="text-base">Centres Map</CardTitle>
               <ViewSwitcher
                 value={mapMode}
                 onValueChange={(value) => setMapMode(value as "city" | "state")}
                 options={[
                   {
                     value: "city",
                     label: "City",
                     icon: <RiMapPinLine className="h-4 w-4" />,
                   },
                   {
                     value: "state",
                     label: "State",
                     icon: <RiStackLine className="h-4 w-4" />,
                   },
                 ]}
                 className="ml-auto"
               />
             </div>
           </CardHeader>
           <CardContent className="relative p-0 flex flex-col flex-1 overflow-hidden">
             {mapLoading && <MapUpdatingPill />}
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
               <CardTitle className="text-base">Centres Data</CardTitle>
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
                       label: "Table",
                       icon: (
                         <RiTableLine className="h-4 w-4" />
                       ),
                     },
                     {
                       value: "grid",
                       label: "Grid",
                       icon: (
                         <RiLayoutGridLine className="h-4 w-4" />
                       ),
                     },
                   ]}
                 />
               </div>
             </div>
           </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-0">
              {dataLayout === "table" ? (
                <DataTable
                  key="table"
                  table={table}
                  loading={server?.loading}
                  onRowOpen={handleRowOpen}
                  getRowLabel={(center) => `View centre details for ${center.center_name || "center"}`}
                  renderRowMenu={(center) => <CenterRowMenu center={center} onOpen={handleRowOpen} />}
                  scrollRef={scrollContainerRef}
                />
              ) : (
                <div key="grid" ref={scrollContainerRef} className="view-content min-h-0 flex-1 overflow-auto rounded-md border">
                  <DataGridSortBar column={table.getColumn("name")} label="centre name" />
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {server?.loading ? <GridSkeletonCards statRows={3} /> : pageCenters.map((center) => (
                      <CenterGridCard
                        key={center.cn_unique_key}
                        center={center}
                        onClick={() => handleCenterClick(center, "grid_card")}
                      />
                    ))}
                  </div>
                </div>
              )}
              <DataTablePagination table={table} totalRows={totalRows} />
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
        services={services}
        tech={tech}
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        fetchRelated={Boolean(server)}
      />

      <SelectionActionBar
        entity="center"
        show={centersView === "data" && selectedKeys.size > 0}
        count={selectedKeys.size}
        onClear={clearSelection}
        onExport={() => onDownloadSelection?.({ dataset: "centers", centerKeys: Array.from(selectedKeys) })}
      />
    </TabsContent>
  )
}
