"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, PieChartIcon, Table as TableIcon, LayoutGrid } from "lucide-react"
import { ProspectRow } from "@/components/tables/prospect-row"
import { ProspectGridCard } from "@/components/cards/prospect-grid-card"
import { PieChartCard } from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import { getPaginatedData } from "@/lib/utils/helpers"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { SortButton } from "@/components/ui/sort-button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { useRecentlyUpdatedTableRecords } from "@/hooks/use-recently-updated-table-records"
import type { Prospect } from "@/lib/types"

interface ProspectsTabProps {
  prospects: Prospect[]
  prospectChartData: {
    departmentData: Array<{ name: string; value: number; fill?: string }>
    levelData: Array<{ name: string; value: number; fill?: string }>
  }
  prospectsView: "chart" | "data"
  setProspectsView: (view: "chart" | "data") => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  itemsPerPage: number
}

export function ProspectsTab({
  prospects,
  prospectChartData,
  prospectsView,
  setProspectsView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
}: ProspectsTabProps) {
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "title" | "department"
    direction: "asc" | "desc" | null
  }>({
    key: "name",
    direction: null,
  })
  const [dataLayout, setDataLayout] = useState<"table" | "grid">("table")
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

  const getProspectFallbackIdentity = React.useCallback((prospect: Prospect) => {
    const normalized = (value: string | null | undefined) => (value ?? "").trim()
    return [
      "fallback:prospect_email=",
      normalized(prospect.prospect_email),
      "|prospect_full_name=",
      normalized(prospect.prospect_full_name),
      "|prospect_first_name=",
      normalized(prospect.prospect_first_name),
      "|prospect_last_name=",
      normalized(prospect.prospect_last_name),
      "|account_global_legal_name=",
      normalized(prospect.account_global_legal_name),
    ].join("")
  }, [])

  const { isRecordRecentlyUpdated: isProspectRecentlyUpdated, markRecordAsRead: markProspectAsRead } =
    useRecentlyUpdatedTableRecords<Prospect>({
      tableName: "prospects",
      getRecordUuid: (prospect) => prospect.uuid,
      getRecordIdentity: (prospect) => {
        const prospectKey = (prospect as Prospect & { ps_unique_key?: string | null }).ps_unique_key
        if (!prospectKey) return null
        return `key:ps_unique_key=${prospectKey}`
      },
      getRecordLabel: getProspectDisplayName,
      getAdditionalRecordIdentities: (prospect) => [getProspectFallbackIdentity(prospect)],
      getAdditionalRecordLabels: (prospect) => [
        prospect.prospect_email,
        prospect.prospect_full_name,
        [prospect.prospect_first_name, prospect.prospect_last_name].filter(Boolean).join(" "),
      ],
    })

  const handleProspectClick = (prospect: Prospect, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "prospect",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
      void markProspectAsRead(openedRecordRef.current.prospect)
    }
    setSelectedProspect(prospect)
    setIsDialogOpen(true)
    const prospectName = getProspectDisplayName(prospect)
    const recordId = `${prospect.account_global_legal_name}-${prospectName}-${prospect.prospect_title ?? ""}`
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
    void markProspectAsRead(openedRecordRef.current.prospect)
    openedRecordRef.current = null
  }, [isDialogOpen, markProspectAsRead])


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
          return [prospect.prospect_city, prospect.prospect_country].filter(Boolean).join(", ")
        case "title":
          return prospect.prospect_title
        default:
          return prospect.prospect_department
      }
    }

    const sorted = [...prospects].sort((a, b) => compare(getValue(a), getValue(b)))
    return sort.direction === "asc" ? sorted : sorted.reverse()
  }, [prospects, sort])

  // Show empty state when no prospects
  if (prospects.length === 0) {
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
        <div className="w-full mb-6 animate-fade-in">
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
         <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm animate-fade-in">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex flex-wrap items-center gap-3">
               <CardTitle className="text-base">Prospects Data</CardTitle>
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
                        <TableHead className="w-16"></TableHead>
                        <TableHead className="w-[220px]">
                          <SortButton label="Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[200px]">
                          <SortButton label="Location" sortKey="location" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[220px]">
                          <SortButton label="Job Title" sortKey="title" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[180px]">
                          <SortButton label="Department" sortKey="department" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getPaginatedData(sortedProspects, currentPage, itemsPerPage).map(
                        (prospect, index) => (
                          <ProspectRow
                            key={`${prospect.prospect_email}-${index}`}
                            prospect={prospect}
                            isRecentlyUpdated={isProspectRecentlyUpdated(prospect)}
                            onClick={() => handleProspectClick(prospect, "table_row")}
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
                      {getPaginatedData(sortedProspects, currentPage, itemsPerPage).map(
                        (prospect, index) => (
                          <ProspectGridCard
                            key={`${prospect.prospect_email}-${index}`}
                            prospect={prospect}
                            isRecentlyUpdated={isProspectRecentlyUpdated(prospect)}
                            onClick={() => handleProspectClick(prospect, "grid_card")}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
                  {prospects.length > 0 && (
                    <PaginationControls
                      currentPage={currentPage}
                      totalItems={prospects.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      dataLength={prospects.length}
                    />
                  )}
            </CardContent>
         </Card>
       )}

      {/* Prospect Details Dialog */}
      <ProspectDetailsDialog
        prospect={selectedProspect}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </TabsContent>
  )
}
