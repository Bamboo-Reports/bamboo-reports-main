"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpDown,
  LayoutGrid,
  MapIcon,
  MapPin,
  PieChartIcon,
  Table as TableIcon,
  Layers,
} from "lucide-react"
import { AccountRow } from "@/components/tables"
import { AccountGridCard } from "@/components/cards/account-grid-card"
import { PieChartCard } from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { CentersMap } from "@/components/maps/centers-map"
import { CentersChoroplethMap } from "@/components/maps/centers-choropleth-map"
import { MapErrorBoundary } from "@/components/maps/map-error-boundary"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { SortButton } from "@/components/ui/sort-button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getPaginatedData } from "@/lib/utils/helpers"
import { useRecentlyUpdatedAccounts } from "@/hooks/use-recently-updated-accounts"
import type { Account, Center, Prospect, Service, Function, Tech } from "@/lib/types"

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
  accountsView: "chart" | "data" | "map"
  setAccountsView: (view: "chart" | "data" | "map") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
}

export function AccountsTab({
  accounts,
  centers,
  prospects,
  services,
  tech,
  accountChartData,
  accountsView,
  setAccountsView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
}: AccountsTabProps) {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "industry" | "revenue"
    direction: "asc" | "desc" | null
  }>({
    key: "name",
    direction: null,
  })
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const [mapMode, setMapMode] = useState<"city" | "state">("state")
  const previousDataLayoutRef = React.useRef<"table" | "grid">("table")
  const previousMapModeRef = React.useRef<"city" | "state">("state")
  const openedRecordRef = React.useRef<{
    recordId: string
    openedAt: number
    openedFrom: "table_row" | "grid_card"
    account: Account
  } | null>(null)
  const { isAccountRecentlyUpdated, markAccountAsRead } = useRecentlyUpdatedAccounts()

  const handleAccountClick = (account: Account, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "account",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
      void markAccountAsRead(openedRecordRef.current.account)
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
      entity: "account",
      sort_key: key,
      sort_direction: nextDirection ?? "none",
    })
    setCurrentPage(1)
  }

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
    void markAccountAsRead(openedRecordRef.current.account)
    openedRecordRef.current = null
  }, [isDialogOpen, markAccountAsRead])


  const sortedAccounts = React.useMemo(() => {
    if (!sort.direction) return accounts

    const compare = (a: string | undefined | null, b: string | undefined | null) =>
      (a || "").localeCompare(b || "", undefined, { sensitivity: "base" })

    const getValue = (account: Account) => {
      switch (sort.key) {
        case "employees":
          return account.account_center_employees_range
        case "industry":
          return account.account_hq_industry
        case "revenue":
          return account.account_hq_revenue_range
        default:
          return account.account_global_legal_name
      }
    }

    const sorted = [...accounts].sort((a, b) => compare(getValue(a), getValue(b)))
    return sort.direction === "asc" ? sorted : sorted.reverse()
  }, [accounts, sort])

  if (accounts.length === 0) {
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
        <PieChartIcon className="h-5 w-5 text-[hsl(var(--chart-1))]" />
        <h2 className="text-lg font-semibold text-foreground">Account Analytics</h2>
        <ViewSwitcher
          value={accountsView}
          onValueChange={(value) => setAccountsView(value as "chart" | "data" | "map")}
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
      {accountsView === "chart" && (
        <div className="w-full mb-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Region"
              data={accountChartData.regionData}
              countLabel="Total Accounts"
              showBigPercentage
            />
            <PieChartCard
              title="Primary Nature"
              data={accountChartData.primaryNatureData}
              countLabel="Total Accounts"
              showBigPercentage
            />
            <PieChartCard
              title="Revenue Range"
              data={accountChartData.revenueRangeData}
              countLabel="Total Accounts"
              showBigPercentage
            />
            <PieChartCard
              title="Aggregate India Headcount"
              data={accountChartData.employeesRangeData}
              countLabel="Total Accounts"
              showBigPercentage
            />
          </div>
        </div>
      )}

      {/* Map Section */}
      {accountsView === "map" && (
        <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm animate-fade-in">
          <CardHeader className="shrink-0 px-6 py-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Accounts Map</CardTitle>
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
                <CentersMap centers={centers} heightClass="h-full" />
              ) : (
                <CentersChoroplethMap centers={centers} heightClass="h-full" />
              )}
            </MapErrorBoundary>
          </CardContent>
        </Card>
      )}

      {/* Data View */}
      {accountsView === "data" && (
        <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm animate-fade-in">
          <CardHeader className="shrink-0 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">Accounts Data</CardTitle>
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
                className="ml-auto"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto">
              {dataLayout === "table" ? (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">
                        <SortButton label="Account Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      <TableHead className="w-[220px]">
                        <SortButton label="Industry" sortKey="industry" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      <TableHead className="w-[140px]">
                        <SortButton label="Revenue Range" sortKey="revenue" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      <TableHead className="w-[200px]">
                        <SortButton label="Aggregate India Headcount" sortKey="employees" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getPaginatedData(sortedAccounts, currentPage, itemsPerPage).map(
                      (account, index) => (
                        <AccountRow
                          key={`${account.account_global_legal_name}-${index}`}
                          account={account}
                          isRecentlyUpdated={isAccountRecentlyUpdated(account)}
                          onClick={() => handleAccountClick(account, "table_row")}
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
                        aria-label="Sort by account name"
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
                      {getPaginatedData(sortedAccounts, currentPage, itemsPerPage).map(
                        (account, index) => (
                        <AccountGridCard
                          key={`${account.account_global_legal_name}-${index}`}
                          account={account}
                          isRecentlyUpdated={isAccountRecentlyUpdated(account)}
                          onClick={() => handleAccountClick(account, "grid_card")}
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
            {accounts.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalItems={accounts.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                dataLength={accounts.length}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Details Dialog */}
      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={prospects}
        services={services}
        tech={tech}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </TabsContent>
  )
}
