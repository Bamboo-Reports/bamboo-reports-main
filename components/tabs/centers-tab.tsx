"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowDownAZ, ArrowUpAZ, ArrowUpDown, PieChartIcon, Table as TableIcon, MapIcon, LayoutGrid, Layers, MapPin } from "lucide-react"
import { CenterRow } from "@/components/tables"
import { CenterGridCard } from "@/components/cards/center-grid-card"
import { PieChartCard } from "@/components/charts/pie-chart-card"
import { EmptyState } from "@/components/states/empty-state"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"
import { getPaginatedData } from "@/lib/utils/helpers"
import { CentersMap } from "@/components/maps/centers-map"
import { CentersChoroplethMap } from "@/components/maps/centers-choropleth-map"
import { MapErrorBoundary } from "@/components/maps/map-error-boundary"
import { ViewSwitcher } from "@/components/ui/view-switcher"
import { SortButton } from "@/components/ui/sort-button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { useRecentlyUpdatedTableRecords } from "@/hooks/use-recently-updated-table-records"
import type { Center, Function, Service } from "@/lib/types"

interface CentersTabProps {
  centers: Center[]
  allCenters: Center[]
  functions: Function[]
  services: Service[]
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
}

export function CentersTab({
  centers,
  allCenters,
  services,
  centerChartData,
  centersView,
  setCentersView,
  currentPage,
  setCurrentPage,
  itemsPerPage,
}: CentersTabProps) {
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: "name" | "location" | "type" | "employees"
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
    center: Center
  } | null>(null)
  const { isRecordRecentlyUpdated: isCenterRecentlyUpdated, markRecordAsRead: markCenterAsRead } =
    useRecentlyUpdatedTableRecords<Center>({
      tableName: "centers",
      getRecordUuid: (center) => center.uuid,
      getRecordIdentity: (center) => `key:cn_unique_key=${center.cn_unique_key}`,
      getRecordLabel: (center) => center.center_name,
      getAdditionalRecordLabels: (center) => [center.cn_unique_key],
    })

  const handleCenterClick = (center: Center, openedFrom: "table_row" | "grid_card") => {
    if (isDialogOpen && openedRecordRef.current) {
      const dwellSeconds = Math.max(0, Math.round((Date.now() - openedRecordRef.current.openedAt) / 1000))
      captureEvent(ANALYTICS_EVENTS.RECORD_CLOSED, {
        entity: "center",
        record_id: openedRecordRef.current.recordId,
        dwell_seconds: dwellSeconds,
        close_reason: "switch_to_another_record",
      })
      void markCenterAsRead(openedRecordRef.current.center)
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
      record_label: center.center_name ?? "Unknown Center",
      source_view: centersView,
      source_layout: centersView === "data" ? dataLayout : null,
      opened_from: openedFrom,
      has_center_key: Boolean(center.cn_unique_key),
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
      entity: "center",
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
    void markCenterAsRead(openedRecordRef.current.center)
    openedRecordRef.current = null
  }, [isDialogOpen, markCenterAsRead])


  const sortedCenters = React.useMemo(() => {
    if (!sort.direction) return centers

    const compare = (a: string | undefined | null, b: string | undefined | null) =>
      (a || "").localeCompare(b || "", undefined, { sensitivity: "base" })

    const getValue = (center: Center) => {
      switch (sort.key) {
        case "name":
          return center.center_name
        case "location":
          return [center.center_city, center.center_country].filter(Boolean).join(", ")
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
  }, [centers, sort])

  // Show empty state when no centers
  if (centers.length === 0) {
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
        <div className="w-full mb-6 animate-fade-in">
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
         <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm animate-fade-in">
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
                 <CentersMap centers={centers} heightClass="h-full" />
               ) : (
                 <CentersChoroplethMap centers={centers} allCenters={allCenters} heightClass="h-full" />
               )}
             </MapErrorBoundary>
           </CardContent>
         </Card>
       )}

       {/* Data Table */}
       {centersView === "data" && (
         <Card className="w-full flex flex-col h-[var(--dashboard-panel-height)] border shadow-sm animate-fade-in">
           <CardHeader className="shrink-0 px-6 py-3">
             <div className="flex flex-wrap items-center gap-3">
               <CardTitle className="text-base">Centers Data</CardTitle>
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
                        <TableHead className="w-[260px]">
                          <SortButton label="Center Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[200px]">
                          <SortButton label="Location" sortKey="location" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[200px]">
                          <SortButton label="Center Type" sortKey="type" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                        <TableHead className="w-[160px]">
                          <SortButton label="Center Headcount" sortKey="employees" currentKey={sort.key} direction={sort.direction} onClick={handleSort} />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getPaginatedData(sortedCenters, currentPage, itemsPerPage).map(
                        (center, index) => (
                          <CenterRow
                            key={`${center.cn_unique_key}-${index}`}
                            center={center}
                            isRecentlyUpdated={isCenterRecentlyUpdated(center)}
                            onClick={() => handleCenterClick(center, "table_row")}
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
                      {getPaginatedData(sortedCenters, currentPage, itemsPerPage).map(
                        (center, index) => (
                          <CenterGridCard
                            key={`${center.cn_unique_key}-${index}`}
                            center={center}
                            isRecentlyUpdated={isCenterRecentlyUpdated(center)}
                            onClick={() => handleCenterClick(center, "grid_card")}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
                  {centers.length > 0 && (
                    <PaginationControls
                      currentPage={currentPage}
                      totalItems={centers.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      dataLength={centers.length}
                    />
                  )}
            </CardContent>
         </Card>
       )}

      {/* Center Details Dialog */}
      <CenterDetailsDialog
        center={selectedCenter}
        services={services}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </TabsContent>
  )
}
