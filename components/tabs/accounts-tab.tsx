"use client"

import React, { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
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
  chartLabelDisplay: PieChartLabelDisplay
  onChartLabelDisplayChange: (display: PieChartLabelDisplay) => void
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
  chartsLoading?: boolean
  mapLoading?: boolean
}

/** Placeholder rows while a page loads. Mirrors real row structure (logo plus two text lines in the name column) so row heights match and the table does not jump when data lands. */
export function TableSkeletonRows({ rows = 8, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={`skeleton-${i}`}>
          {Array.from({ length: columns }, (_, j) => (
            <TableCell key={j}>
              {j === 0 ? (
                <Skeleton className="h-4 w-4" />
              ) : j === 1 ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ) : (
                <Skeleton className="h-4 w-3/4" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

/** Placeholder cards for the grid layout. Mirrors real card structure (header with logo, stat lines, action button) so card heights match and the grid does not jump when data lands. */
export function GridSkeletonCards({ cards = 6 }: { cards?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <div key={`skeleton-card-${i}`} className="rounded-lg border bg-card p-4 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2 py-0.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </>
  )
}

/** A small floating pill shown over maps while fresh aggregates load. */
export function MapUpdatingPill() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur animate-pulse">
      Updating map
    </div>
  )
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
  chartLabelDisplay,
  onChartLabelDisplayChange,
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
  chartsLoading = false,
  mapLoading = false,
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
        <PieChartIcon className="h-5 w-5 text-primary" />
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
                <PieChartIcon className="h-4 w-4" />
              ),
            },
            ...(allowMapView
              ? [{
                  value: "map",
                  label: "Map",
                  icon: (
                    <MapIcon className="h-4 w-4" />
                  ),
                }]
              : []),
            {
              value: "data",
              label: "Data",
              icon: (
                <TableIcon className="h-4 w-4" />
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
                    icon: <MapPin className="h-4 w-4" />,
                  },
                  {
                    value: "state",
                    label: "State",
                    icon: <Layers className="h-4 w-4" />,
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
                        <TableIcon className="h-4 w-4" />
                      ),
                    },
                    {
                      value: "grid",
                      label: "Grid",
                      icon: (
                        <LayoutGrid className="h-4 w-4" />
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
                    {server?.loading ? (
                      <TableSkeletonRows columns={1 + (["name", "industry", "revenue", "employees"] as const).filter(isColumnVisible).length} />
                    ) : pageAccounts.map(
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSort("name")}
                        className="h-8 w-8 px-0"
                        aria-label="Sort by account name"
                        aria-pressed={sort.key === "name" && sort.direction !== null}
                      >
                        {sort.key !== "name" || sort.direction === null ? (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : sort.direction === "asc" ? (
                          <ArrowUpAZ className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ArrowDownAZ className="h-3.5 w-3.5 text-primary" />
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                      {server?.loading ? <GridSkeletonCards /> : pageAccounts.map(
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
