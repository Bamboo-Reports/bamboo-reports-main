"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { GridSkeletonCards, MapUpdatingPill } from "@/components/ui/data-skeletons"
import { cn } from "@/lib/utils"
import { RiLayoutGridLine, RiMapLine, RiMapPinLine, RiPieChartLine, RiStackLine, RiTableLine } from "@remixicon/react"
import { AccountRowMenu, accountColumns, getAccountKey } from "@/components/tables/account-columns"
import { DataGridSortBar, DataTable, DataTablePagination } from "@/components/tables/data-table"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useDataTable } from "@/components/tables/use-data-table"
import { AccountGridCard } from "@/components/cards/account-grid-card"
import {
  PieChartCard,
  type PieChartLabelDisplay,
} from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { CentersMap } from "@/components/maps/centers-map"
import { CentersChoroplethMap } from "@/components/maps/centers-choropleth-map"
import { MapErrorBoundary } from "@/components/maps/map-error-boundary"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { canAccessAccountsMapView } from "@/lib/config/dashboard-access"
import type { CityAggregate, StateAggregate } from "@/lib/dashboard/api-client"
import type { Account, Center, Prospect, Service, Function, Tech } from "@/lib/types"

/**
 * Server mode (#249): rows arrive pre-paginated/sorted from the query
 * endpoints; the tab reports sort changes upward and renders server totals.
 */
export interface TabServerProps {
  total: number
  loading?: boolean
  onSortChange: (key: string, direction: "asc" | "desc" | null) => void
}

interface AccountsTabProps {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  services: Service[]
  tech: Tech[]
  functions: Function[]
  accountChartData: {
    regionData: Array<{ name: string; value: number; fill?: string }>
    primaryNatureData: Array<{ name: string; value: number; fill?: string }>
    revenueRangeData: Array<{ name: string; value: number; fill?: string }>
    employeesRangeData: Array<{ name: string; value: number; fill?: string }>
  }
  chartLabelDisplay: PieChartLabelDisplay
  onChartLabelDisplayChange: (display: PieChartLabelDisplay) => void
  accountsView: "chart" | "data" | "map"
  setAccountsView: (view: "chart" | "data" | "map") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  setItemsPerPage: (size: number) => void
  onDownloadSelection?: (scope: { dataset: "accounts"; accountNames: string[] }) => void
  server?: TabServerProps | null
  mapData?: { cities: CityAggregate[]; states: StateAggregate[] } | null
  chartsLoading?: boolean
  mapLoading?: boolean
}

export function AccountsTab({
  accounts,
  centers,
  prospects,
  services,
  tech,
  accountChartData,
  chartLabelDisplay,
  onChartLabelDisplayChange,
  accountsView,
  setAccountsView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  onDownloadSelection,
  server,
  mapData,
  chartsLoading = false,
  mapLoading = false,
}: AccountsTabProps) {
  const allowMapView = canAccessAccountsMapView()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const [mapMode, setMapMode] = useState<"city" | "state">("state")
  const {
    table,
    totalRows,
    selectedKeys: selectedNames,
    clearSelection,
  } = useDataTable({
    dataset: "accounts",
    data: accounts,
    columns: accountColumns,
    getRowKey: getAccountKey,
    server,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  })
  const pageAccounts = table.getRowModel().rows.map((row) => row.original)
  const nameColumn = table.getColumn("name")
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [currentPage])

  useEffect(() => {
    if (!allowMapView && accountsView === "map") {
      setAccountsView("chart")
    }
  }, [allowMapView, accountsView, setAccountsView])
  const previousDataLayoutRef = React.useRef<"table" | "grid">("table")
  const previousMapModeRef = React.useRef<"city" | "state">("state")
  const openedRecordRef = React.useRef<{
    recordId: string
    openedAt: number
    openedFrom: "table_row" | "grid_card"
    account: Account
  } | null>(null)
  const handleAccountClick = React.useCallback((account: Account, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "account",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
    }
    setSelectedAccount(account)
    setIsDialogOpen(true)
    openedRecordRef.current = {
      recordId: account.account_global_legal_name,
      openedAt: Date.now(),
      openedFrom,
      account,
    }
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "account",
      record_id: account.account_global_legal_name,
      record_label: account.account_global_legal_name,
      source_view: accountsView,
      source_layout: accountsView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_website: Boolean(account.account_hq_website),
    })
  }, [isDialogOpen, accountsView, dataLayout])


  React.useEffect(() => {
    if (previousDataLayoutRef.current === dataLayout) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.DATA_LAYOUT_CHANGED, {
      screen: "accounts",
      data_layout: dataLayout,
    })

    previousDataLayoutRef.current = dataLayout
  }, [dataLayout])

  React.useEffect(() => {
    if (previousMapModeRef.current === mapMode) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.MAP_MODE_CHANGED, {
      screen: "accounts",
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
      entity: "account",
      record_id: openedRecordRef.current.recordId,
      dwell_seconds: dwellSeconds,
      close_reason: "dialog_closed",
    })
    openedRecordRef.current = null
  }, [isDialogOpen])


  const handleRowOpen = React.useCallback(
    (account: Account) => handleAccountClick(account, "table_row"),
    [handleAccountClick]
  )

  if (server ? server.total === 0 && !server.loading : accounts.length === 0) {
    return (
      <TabsContent value="accounts">
        <EmptyState type="no-results" />
      </TabsContent>
    )
  }

  return (
    <TabsContent value="accounts">
      {/* Header with View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <RiPieChartLine className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Account Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
          value={accountsView}
          onValueChange={(value) => setAccountsView(value as "chart" | "data" | "map")}
          options={[
            {
              value: "chart",
              label: "Charts",
              icon: (
                <RiPieChartLine className="h-4 w-4" />
              ),
            },
            ...(allowMapView
              ? [{
                  value: "map",
                  label: "Map",
                  icon: (
                    <RiMapLine className="h-4 w-4" />
                  ),
                }]
              : []),
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
      {accountsView === "chart" && (
        <div className="w-full mb-6 view-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Country"
              data={accountChartData.regionData}
              countLabel="Total Accounts"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="Industry"
              data={accountChartData.primaryNatureData}
              countLabel="Total Accounts"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="Revenue Range"
              data={accountChartData.revenueRangeData}
              countLabel="Total Accounts"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="GCC Aggregate Headcount (India)"
              data={accountChartData.employeesRangeData}
              countLabel="Total Accounts"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
          </div>
        </div>
      )}

      {/* Map Section */}
      {accountsView === "map" && (
        <Card data-tour="map-view" className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
          <CardHeader className="shrink-0 px-6 py-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Accounts Map</CardTitle>
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
                <CentersChoroplethMap centers={centers} states={mapData?.states} heightClass="h-full" />
              )}
            </MapErrorBoundary>
          </CardContent>
        </Card>
      )}

      {/* Data View */}
      {accountsView === "data" && (
        <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
          <CardHeader className="shrink-0 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">Accounts Data</CardTitle>
              <div className="ml-auto flex items-center gap-2">
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
                getRowLabel={(account) => `View account details for ${account.account_global_legal_name || "account"}`}
                renderRowMenu={(account) => <AccountRowMenu account={account} onOpen={handleRowOpen} />}
                scrollRef={scrollContainerRef}
              />
            ) : (
              <div key="grid" ref={scrollContainerRef} className="view-content min-h-0 flex-1 overflow-auto rounded-md border">
                <DataGridSortBar column={nameColumn} label="account name" />
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {server?.loading ? <GridSkeletonCards /> : pageAccounts.map((account) => (
                    <AccountGridCard
                      key={account.account_global_legal_name}
                      account={account}
                      onClick={() => handleAccountClick(account, "grid_card")}
                    />
                  ))}
                </div>
              </div>
            )}
            <DataTablePagination table={table} totalRows={totalRows} />
          </CardContent>
        </Card>
      )}

      {/* Floating selection action bar */}
      <SelectionActionBar
        entity="account"
        show={accountsView === "data" && selectedNames.size > 0}
        count={selectedNames.size}
        onClear={clearSelection}
        onExport={() => onDownloadSelection?.({ dataset: "accounts", accountNames: Array.from(selectedNames) })}
      />

      {/* Account Details Dialog */}
      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={prospects}
        services={services}
        tech={tech}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        fetchRelated={Boolean(server)}
      />
    </TabsContent>
  )
}
