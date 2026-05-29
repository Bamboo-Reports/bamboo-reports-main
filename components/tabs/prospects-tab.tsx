"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, PieChartIcon, Table as TableIcon, LayoutGrid } from "lucide-react"
import { ProspectRow } from "@/components/tables/prospect-row"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useRowSelection } from "@/hooks/use-row-selection"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { PieChartCard } from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { LockedProspectTeaserCard, LockedProspectTeaserRow } from "@/components/prospects/locked-prospect-teaser-section"
import { getPaginatedData } from "@/lib/utils/helpers"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { SortButton } from "@/components/ui/sort-button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { TableColumnMenu } from "@/components/tables/table-column-menu"
import { useTableColumnPreferences } from "@/hooks/use-table-column-preferences"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { Account, Center, LockedProspectTeaser, Prospect, Service, Tech } from "@/lib/types"

interface ProspectsTabProps {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  allProspects: Prospect[]
  lockedProspectTeasers: LockedProspectTeaser[]
  services: Service[]
  tech: Tech[]
  prospectChartData: {
    departmentData: Array<{ name: string; value: number; fill?: string }>
    levelData: Array<{ name: string; value: number; fill?: string }>
  }
  prospectsView: "chart" | "data"
  setProspectsView: (view: "chart" | "data") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  onRecordOpened?: (item: { type: "prospect" | "account"; id: string; title: string; subtitle: string }) => void
  onDownloadSelection?: (scope: { dataset: "prospects"; accountNames: string[] }) => void
}

export function ProspectsTab({
  accounts,
  centers,
  prospects,
  allProspects,
  lockedProspectTeasers,
  services,
  tech,
  prospectChartData,
  prospectsView,
  setProspectsView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  onRecordOpened,
  onDownloadSelection,
}: ProspectsTabProps) {
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "title" | "department"
    direction: "asc" | "desc" | null
  }>({
    key: "name",
    direction: null,
  })
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const {
    columns,
    visibleColumnSet,
    isColumnVisible,
    setColumnVisible,
    resetColumns,
  } = useTableColumnPreferences("prospects")
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [currentPage])
  const previousDataLayoutRef = React.useRef<"table" | "grid">("table")
  const openedRecordRef = React.useRef<{
    recordId: string
    openedAt: number
    openedFrom: "table_row" | "grid_card"
    prospect: Prospect
  } | null>(null)

  const getProspectDisplayName = React.useCallback((prospect: Prospect) => {
    return (
      prospect.prospect_full_name ||
      [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ") ||
      "Unknown Prospect"
    )
  }, [])

  const getProspectRecordId = React.useCallback((prospect: Prospect) => {
    return prospect.ps_unique_key || `${prospect.account_global_legal_name}::${getProspectDisplayName(prospect)}`
  }, [getProspectDisplayName])

  const handleProspectClick = (prospect: Prospect, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "prospect",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
    }
    setSelectedProspect(prospect)
    setIsDialogOpen(true)
    const prospectName = getProspectDisplayName(prospect)
    const recordId = getProspectRecordId(prospect)
    onRecordOpened?.({
      type: "prospect",
      id: recordId,
      title: prospectName,
      subtitle: prospect.prospect_title || prospect.prospect_department || prospect.account_global_legal_name || "",
    })
    openedRecordRef.current = {
      recordId,
      openedAt: Date.now(),
      openedFrom,
      prospect,
    }
    captureEvent(ANALYTICS_EVENTS.RECORD_OPENED, {
      entity: "prospect",
      record_id: recordId,
      record_label: prospectName,
      source_view: prospectsView,
      source_layout: prospectsView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_contact_field: Boolean(prospect.prospect_email),
    })
  }

  const handleAccountOpen = (accountName: string) => {
    const account = accounts.find((item) => item.account_global_legal_name === accountName)
    if (!account) return

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
      source_view: "prospect_details",
      source_layout: prospectsView === "data" ? dataLayout : null,
      opened_from: "related_account_link",
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
      entity: "prospect",
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
      screen: "prospects",
      data_layout: dataLayout,
    })

    previousDataLayoutRef.current = dataLayout
  }, [dataLayout])

  React.useEffect(() => {
    if (isDialogOpen || !openedRecordRef.current) {
      return
    }

    const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
    captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
      entity: "prospect",
      record_id: openedRecordRef.current.recordId,
      dwell_seconds: dwellSeconds,
      close_reason: "dialog_closed",
    })
    openedRecordRef.current = null
  }, [isDialogOpen])


  const sortedProspects = React.useMemo(() => {
    if (!sort.direction) return prospects

    const compare = (a: string | undefined | null, b: string | undefined | null) =>
      (a || "").localeCompare(b || "", undefined, { sensitivity: "base" })

    const getValue = (prospect: Prospect) => {
      switch (sort.key) {
        case "name":
          return (
            prospect.prospect_full_name ||
            [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" ")
          )
        case "location":
          return [prospect.prospect_city, prospect.prospect_state].filter(Boolean).join(", ") || prospect.prospect_country || ""
        case "title":
          return prospect.prospect_title
        default:
          return prospect.prospect_department
      }
    }

    const sorted = [...prospects].sort((a, b) => compare(getValue(a), getValue(b)))
    return sort.direction === "asc" ? sorted : sorted.reverse()
  }, [prospects, sort])

  const lockedTeaserCountsByAccount = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const teaser of lockedProspectTeasers) {
      counts.set(teaser.account_global_legal_name, (counts.get(teaser.account_global_legal_name) ?? 0) + 1)
    }
    return counts
  }, [lockedProspectTeasers])

  const gridItems = React.useMemo(
    () => [
      ...sortedProspects.map((prospect) => ({ type: "visible" as const, prospect })),
      ...lockedProspectTeasers.map((teaser) => ({ type: "locked" as const, teaser })),
    ],
    [sortedProspects, lockedProspectTeasers]
  )
  const tableItems = React.useMemo(
    () => [
      ...sortedProspects.map((prospect) => ({ type: "visible" as const, prospect })),
      ...lockedProspectTeasers.map((teaser) => ({ type: "locked" as const, teaser })),
    ],
    [sortedProspects, lockedProspectTeasers]
  )

  const accountNameByKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const prospect of prospects) {
      const key = getProspectRecordId(prospect)
      if (prospect.account_global_legal_name) map.set(key, prospect.account_global_legal_name)
    }
    return map
  }, [prospects, getProspectRecordId])
  const availableKeys = React.useMemo(
    () => prospects.map((prospect) => getProspectRecordId(prospect)),
    [prospects, getProspectRecordId]
  )
  const { selected: selectedKeys, toggle: toggleRow, toggleMany, clear: clearSelection } =
    useRowSelection(availableKeys)
  const pageKeys = React.useMemo(
    () =>
      getPaginatedData(tableItems, currentPage, itemsPerPage)
        .filter((item) => item.type === "visible")
        .map((item) => getProspectRecordId(item.prospect)),
    [tableItems, currentPage, itemsPerPage, getProspectRecordId]
  )
  const selectedOnPageCount = pageKeys.filter((key) => selectedKeys.has(key)).length
  const allPageSelected = pageKeys.length > 0 && selectedOnPageCount === pageKeys.length
  const somePageSelected = selectedOnPageCount > 0 && !allPageSelected

  const handleExportSelection = () => {
    const names = new Set<string>()
    for (const key of selectedKeys) {
      const name = accountNameByKey.get(key)
      if (name) names.add(name)
    }
    onDownloadSelection?.({ dataset: "prospects", accountNames: Array.from(names) })
  }

  // Show empty state when no prospects
  if (prospects.length === 0 && lockedProspectTeasers.length === 0) {
    return (
      <TabsContent value="prospects">
        <EmptyState type="no-results" />
      </TabsContent>
    )
  }

  return (
    <TabsContent value="prospects">
      {/* Header with View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="h-5 w-5 text-[hsl(var(--chart-1))]" />
        <h2 className="text-lg font-semibold text-foreground">Prospect Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
          value={prospectsView}
          onValueChange={(value) => setProspectsView(value as "chart" | "data")}
          options={[
            {
              value: "chart",
              label: <span className="text-[hsl(var(--chart-1))]">Charts</span>,
              icon: (
                <PieChartIcon className="h-4 w-4 text-[hsl(var(--chart-1))]" />
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
      {prospectsView === "chart" && (
        <div className="w-full mb-6 view-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Department"
              data={prospectChartData.departmentData}
              countLabel="Total Prospects"
              showBigPercentage
            />
            <PieChartCard
              title="Level"
              data={prospectChartData.levelData}
              countLabel="Total Prospects"
              showBigPercentage
            />
          </div>
        </div>
      )}

       {/* Data Table */}
       {prospectsView === "data" && (
         <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm view-content">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex flex-wrap items-center gap-3">
               <CardTitle className="text-base">Prospects Data</CardTitle>
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
                            aria-label="Select all prospects on this page"
                          />
                        </TableHead>
                        {isColumnVisible("avatar") && (
                        <TableHead className="w-16"></TableHead>
                        )}
                        {isColumnVisible("name") && (
                        <TableHead className="w-[220px]">
                          <SortButton label="Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("location") && (
                        <TableHead className="w-[200px]">
                          <SortButton label="Location" sortKey="location" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("title") && (
                        <TableHead className="w-[180px]">
                          <SortButton label="Job Title" sortKey="title" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                        {isColumnVisible("department") && (
                        <TableHead className="w-[180px]">
                          <SortButton label="Department" sortKey="department" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getPaginatedData(tableItems, currentPage, itemsPerPage).map((item) =>
                        item.type === "visible" ? (
                          <ProspectRow
                            key={getProspectRecordId(item.prospect)}
                            prospect={item.prospect}
                            onClick={() => handleProspectClick(item.prospect, "table_row")}
                            visibleColumns={visibleColumnSet}
                            selectable
                            isSelected={selectedKeys.has(getProspectRecordId(item.prospect))}
                            onSelectChange={(checked) => toggleRow(getProspectRecordId(item.prospect), checked)}
                          />
                        ) : (
                          <LockedProspectTeaserRow
                            key={item.teaser.id}
                            teaser={item.teaser}
                            remainingCount={lockedTeaserCountsByAccount.get(item.teaser.account_global_legal_name) ?? 0}
                            visibleColumns={visibleColumnSet}
                            selectable
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
                        aria-label="Sort by prospect name"
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
                      {getPaginatedData(gridItems, currentPage, itemsPerPage).map((item) =>
                        item.type === "visible" ? (
                          <ProspectGridCard
                            key={getProspectRecordId(item.prospect)}
                            prospect={item.prospect}
                            onClick={() => handleProspectClick(item.prospect, "grid_card")}
                          />
                        ) : (
                          <LockedProspectTeaserCard
                            key={item.teaser.id}
                            teaser={item.teaser}
                            remainingCount={lockedTeaserCountsByAccount.get(item.teaser.account_global_legal_name) ?? 0}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
                  {(dataLayout === "grid" ? gridItems.length : tableItems.length) > 0 && (
                    <PaginationControls
                      currentPage={currentPage}
                      totalItems={dataLayout === "grid" ? gridItems.length : tableItems.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      dataLength={dataLayout === "grid" ? gridItems.length : tableItems.length}
                    />
                  )}
            </CardContent>
         </Card>
       )}

      {/* Prospect Details Dialog */}
      <ProspectDetailsDialog
        prospect={selectedProspect}
        allProspects={allProspects}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAccountOpen={handleAccountOpen}
      />

      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={allProspects}
        lockedProspectTeasers={lockedProspectTeasers}
        services={services}
        tech={tech}
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
      />

      <SelectionActionBar
        show={prospectsView === "data" && selectedKeys.size > 0}
        count={selectedKeys.size}
        onClear={clearSelection}
        onExport={handleExportSelection}
      />
    </TabsContent>
  )
}
