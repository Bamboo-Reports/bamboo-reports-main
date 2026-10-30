"use client"

import React, { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { RiLayoutGridLine, RiPieChartLine, RiTableLine } from "@remixicon/react"
import { DataGridSortBar, DataTable, DataTablePagination } from "@/components/tables/data-table"
import { ProspectRowMenu, getProspectKey, prospectColumns } from "@/components/tables/prospect-columns"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"
import { useDataTable } from "@/components/tables/use-data-table"
import { useRecordOpener } from "@/hooks/use-record-opener"
import { getProspectDisplayName as getProspectDisplayNameUtil, getProspectRecordId as getProspectRecordIdUtil } from "@/lib/dashboard/prospect-id"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import {
  PieChartCard,
  type PieChartLabelDisplay,
} from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import { AccountDetailsDialog } from "@/components/dialogs/account-details-tabbed-dialog"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { TableColumnMenu } from "@/components/tables/table-column-menu"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { fetchAccountRelated } from "@/lib/dashboard/api-client"
import type { TabServerProps } from "@/components/tabs/accounts-tab"
import { GridSkeletonCards } from "@/components/ui/data-skeletons"
import { cn } from "@/lib/utils"
import type { Account, Center, Prospect, Service, Tech } from "@/lib/types"

interface ProspectsTabProps {
  accounts: Account[]
  centers: Center[]
  prospects: Prospect[]
  allProspects: Prospect[]
  services: Service[]
  tech: Tech[]
  prospectChartData: {
    departmentData: Array<{ name: string; value: number; fill?: string }>
    levelData: Array<{ name: string; value: number; fill?: string }>
  }
  chartLabelDisplay: PieChartLabelDisplay
  onChartLabelDisplayChange: (display: PieChartLabelDisplay) => void
  prospectsView: "chart" | "data"
  setProspectsView: (view: "chart" | "data") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
  setItemsPerPage: (size: number) => void
  onDownloadSelection?: (scope: { dataset: "prospects"; prospectIds: string[] }) => void
  server?: TabServerProps | null
  chartsLoading?: boolean
}

export function ProspectsTab({
  accounts,
  centers,
  prospects,
  allProspects,
  services,
  tech,
  prospectChartData,
  chartLabelDisplay,
  onChartLabelDisplayChange,
  prospectsView,
  setProspectsView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  onDownloadSelection,
  server,
  chartsLoading = false,
}: ProspectsTabProps) {
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false)
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
  const {
    table,
    totalRows,
    selectedKeys,
    clearSelection,
    columnPreferences: { columns, visibleColumnSet, setColumnVisible, resetColumns },
  } = useDataTable({
    dataset: "prospects",
    data: prospects,
    columns: prospectColumns,
    getRowKey: getProspectKey,
    server,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  })
  const pageProspects = table.getRowModel().rows.map((row) => row.original)
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

  const getProspectDisplayName = React.useCallback(
    (prospect: Prospect) => getProspectDisplayNameUtil(prospect),
    []
  )

  const getProspectRecordId = React.useCallback(
    (prospect: Prospect) => getProspectRecordIdUtil(prospect),
    []
  )

  const handleProspectClick = React.useCallback((prospect: Prospect, openedFrom: "table_row" | "grid_card") => {
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
  }, [isDialogOpen, prospectsView, dataLayout, getProspectDisplayName, getProspectRecordId])

  const openAccount = (account: Account) => {
    setIsDialogOpen(false)
    setSelectedAccount(account)
    setIsAccountDialogOpen(true)
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


  const handleRowOpen = React.useCallback(
    (prospect: Prospect) => handleProspectClick(prospect, "table_row"),
    [handleProspectClick]
  )

  const handleExportSelection = () => {
    onDownloadSelection?.({ dataset: "prospects", prospectIds: Array.from(selectedKeys) })
  }

  // Show empty state when no prospects
  if (server ? server.total === 0 && !server.loading : prospects.length === 0) {
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
        <RiPieChartLine className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Prospect Analytics</h2>
        <ViewSwitcher
          data-tour="view-switcher"
          value={prospectsView}
          onValueChange={(value) => setProspectsView(value as "chart" | "data")}
          options={[
            {
              value: "chart",
              label: "Charts",
              icon: (
                <RiPieChartLine className="h-4 w-4" />
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
      {prospectsView === "chart" && (
        <div className="w-full mb-6 view-content">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PieChartCard
              title="Department"
              data={prospectChartData.departmentData}
              countLabel="Total Prospects"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
            />
            <PieChartCard
              title="Level"
              data={prospectChartData.levelData}
              countLabel="Total Prospects"
              showBigPercentage
              labelDisplay={chartLabelDisplay}
              onLabelDisplayChange={onChartLabelDisplayChange}
              loading={chartsLoading}
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
                  skeletonLead="avatar"
                  onRowOpen={handleRowOpen}
                  getRowLabel={(prospect) => `View prospect details for ${getProspectDisplayName(prospect)}`}
                  renderRowMenu={(prospect) => <ProspectRowMenu prospect={prospect} onOpen={handleRowOpen} />}
                  scrollRef={scrollContainerRef}
                />
              ) : (
                <div key="grid" ref={scrollContainerRef} className="view-content min-h-0 flex-1 overflow-auto rounded-md border">
                  <DataGridSortBar column={table.getColumn("name")} label="prospect name" />
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {server?.loading ? <GridSkeletonCards statRows={3} avatar /> : pageProspects.map((prospect) => (
                      <ProspectGridCard
                        key={getProspectRecordId(prospect)}
                        prospect={prospect}
                        onClick={() => handleProspectClick(prospect, "grid_card")}
                      />
                    ))}
                  </div>
                </div>
              )}
              <DataTablePagination table={table} totalRows={totalRows} />
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
        fetchRelated={Boolean(server)}
      />

      <AccountDetailsDialog
        account={selectedAccount}
        centers={centers}
        prospects={allProspects}
        services={services}
        tech={tech}
        open={isAccountDialogOpen}
        onOpenChange={setIsAccountDialogOpen}
        fetchRelated={Boolean(server)}
      />

      <SelectionActionBar
        entity="prospect"
        show={prospectsView === "data" && selectedKeys.size > 0}
        count={selectedKeys.size}
        onClear={clearSelection}
        onExport={handleExportSelection}
      />
    </TabsContent>
  )
}
