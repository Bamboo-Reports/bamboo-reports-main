"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
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
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useTableRowSelection } from "@/hooks/use-table-row-selection"
import type { FavoriteInput } from "@/hooks/use-favorites"
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
import { TableColumnMenu } from "@/components/tables/table-column-menu"
import { useTableColumnPreferences } from "@/hooks/use-table-column-preferences"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { canAccessAccountsMapView } from "@/lib/config/dashboard-access"
import { getPaginatedData } from "@/lib/utils/helpers"
import type { CityAggregate, StateAggregate } from "@/lib/dashboard/api-client"
import type { Account, Center, Prospect, Service, Function, Tech, LockedProspectTeaser } from "@/lib/types"

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
  lockedProspectTeasers: LockedProspectTeaser[]
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
  onRecordOpened?: (item: { type: "account"; id: string; title: string; subtitle: string }) => void
  onDownloadSelection?: (scope: { dataset: "accounts"; accountNames: string[] }) => void
  favoriteKeys?: Set<string>
  onToggleFavorite?: (item: FavoriteInput) => void
  onFavoriteMany?: (items: FavoriteInput[]) => void
  onUnfavoriteMany?: (items: FavoriteInput[]) => void
  server?: TabServerProps | null
  mapData?: { cities: CityAggregate[]; states: StateAggregate[] } | null
}

// Module-level so the references are stable across renders (passed to memo'd rows).
const getAccountKey = (account: Account) => account.account_global_legal_name ?? ""

function buildAccountFavorite(account: Account): FavoriteInput {
  return {
    entity_type: "account",
    entity_id: account.account_global_legal_name ?? "",
    title: account.account_global_legal_name || "Unknown Account",
    subtitle: [account.account_hq_city, account.account_hq_country].filter(Boolean).join(", ") || null,
  }
}

export function AccountsTab({
  accounts,
  centers,
  prospects,
  lockedProspectTeasers,
  services,
  tech,
  accountChartData,
  accountsView,
  setAccountsView,
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
}: AccountsTabProps) {
  const allowMapView = canAccessAccountsMapView()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "industry" | "revenue" | "employees"
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
  } = useTableColumnPreferences("accounts")
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
    onRecordOpened?.({
      type: "account",
      id: account.account_global_legal_name ?? "",
      title: account.account_global_legal_name ?? "Unknown Account",
      subtitle: [account.account_hq_city, account.account_hq_country].filter(Boolean).join(", "),
    })
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "account",
      record_id: account.account_global_legal_name,
      record_label: account.account_global_legal_name,
      source_view: accountsView,
      source_layout: accountsView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_website: Boolean(account.account_hq_website),
    })
  }, [isDialogOpen, onRecordOpened, accountsView, dataLayout])

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
    server?.onSortChange(key, nextDirection)
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
    openedRecordRef.current = null
  }, [isDialogOpen])


  const sortedAccounts = React.useMemo(() => {
    // Server mode: rows arrive already sorted and paginated.
    if (server || !sort.direction) return accounts

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
  }, [accounts, sort, server])

  const pageAccounts = React.useMemo(
    () => (server ? sortedAccounts : getPaginatedData(sortedAccounts, currentPage, itemsPerPage)),
    [server, sortedAccounts, currentPage, itemsPerPage]
  )
  const {
    selected: selectedNames,
    toggleMany,
    clear: clearSelection,
    pageKeys: pageNames,
    allPageSelected,
    somePageSelected,
    allSelectedFavorited,
    selectedFavoriteInputs,
    handleRowSelectChange,
    handleRowToggleFavorite,
  } = useTableRowSelection({
    items: server ? pageAccounts : accounts,
    pageItems: pageAccounts,
    getKey: getAccountKey,
    favoritePrefix: "account",
    favoriteKeys,
    buildFavorite: buildAccountFavorite,
    onToggleFavorite,
  })

  // Tab-specific open handler kept stable so memo'd rows don't re-render.
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
        <PieChartIcon className="h-5 w-5 text-[hsl(var(--chart-1))]" />
        <h2 className="text-lg font-semibold text-foreground">Account Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
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
            ...(allowMapView
              ? [{
                  value: "map",
                  label: <span className="text-[hsl(var(--chart-4))]">Map</span>,
                  icon: (
                    <MapIcon className="h-4 w-4 text-[hsl(var(--chart-4))]" />
                  ),
                }]
              : []),
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
        <div className="w-full mb-6 view-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Country"
              data={accountChartData.regionData}
              countLabel="Total Accounts"
              showBigPercentage
            />
            <PieChartCard
              title="Industry"
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
              title="GCC Aggregate Headcount (India)"
              data={accountChartData.employeesRangeData}
              countLabel="Total Accounts"
              showBigPercentage
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
                          onCheckedChange={(checked) => toggleMany(pageNames, checked === true)}
                          aria-label="Select all accounts on this page"
                        />
                      </TableHead>
                      {isColumnVisible("name") && (
                      <TableHead className="w-[280px]">
                        <SortButton label="Account Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      )}
                      {isColumnVisible("industry") && (
                      <TableHead className="w-[220px]">
                        <SortButton label="Sub Industry" sortKey="industry" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      )}
                      {isColumnVisible("revenue") && (
                      <TableHead className="w-[140px]">
                        <SortButton label="Revenue Range" sortKey="revenue" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      )}
                      {isColumnVisible("employees") && (
                      <TableHead className="w-[200px]">
                        <SortButton label="GCC Aggregate Headcount (India)" sortKey="employees" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                      </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageAccounts.map(
                      (account) => (
                        <AccountRow
                          key={account.account_global_legal_name}
                          account={account}
                          onOpen={handleRowOpen}
                          visibleColumns={visibleColumnSet}
                          selectable
                          isSelected={selectedNames.has(account.account_global_legal_name ?? "")}
                          onSelectChange={getAccountKey(account) ? handleRowSelectChange : undefined}
                          isFavorite={favoriteKeys?.has(`account:${account.account_global_legal_name ?? ""}`)}
                          onToggleFavorite={onToggleFavorite && getAccountKey(account) ? handleRowToggleFavorite : undefined}
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
                      {pageAccounts.map(
                        (account) => (
                        <AccountGridCard
                          key={account.account_global_legal_name}
                          account={account}
                          onClick={() => handleAccountClick(account, "grid_card")}
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
            {(server ? server.total : accounts.length) > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalItems={server ? server.total : accounts.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                dataLength={server ? server.total : accounts.length}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Floating selection action bar */}
      <SelectionActionBar
        show={accountsView === "data" && selectedNames.size > 0}
        count={selectedNames.size}
        onClear={clearSelection}
        onExport={() => onDownloadSelection?.({ dataset: "accounts", accountNames: Array.from(selectedNames) })}
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

      {/* Account Details Dialog */}
      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={prospects}
        lockedProspectTeasers={lockedProspectTeasers}
        services={services}
        tech={tech}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        fetchRelated={Boolean(server)}
      />
    </TabsContent>
  )
}
