"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import type { ExportDialog } from "@/components/export/export-dialog"
import { describeFilters } from "@/components/filters/filter-description"
import { useAccountLists } from "@/contexts/account-lists-context"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import type { Filters } from "@/lib/types"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

type Range = { min: number; max: number }

export type ExportSelection =
  | { dataset: "accounts"; accountNames: string[] }
  | { dataset: "centers"; centerKeys: string[] }
  | { dataset: "prospects"; prospectIds: string[] }

// How long the export dialog takes to animate closed.
const SCOPE_CLEAR_DELAY_MS = 350

export interface UseDashboardExportParams {
  canExport: boolean
  filters: Filters
  activeFiltersCount: number
  summary: ServerDashboardData["summary"]
  ranges: { revenue: Range; yearsInIndia: Range; centerIncYear: Range }
  onExportCompleted: () => void
}

/** What the export dialog sends for the current filters or a row selection. */
export function buildExportPayload(
  scope: ExportSelection | null,
  filters: Filters,
  activeFiltersCount: number,
  summary: ServerDashboardData["summary"]
) {
  if (!scope) {
    // The client does not hold the filtered arrays (#249 Phase 4): the
    // server builds the export from the filter state, and the dialog shows
    // counts from the summary endpoint.
    return {
      data: { accounts: [], centers: [], services: [], prospects: [] },
      isFiltered: activeFiltersCount > 0,
      filtersSnapshot: filters,
      accountNames: null as string[] | null,
      centerKeys: null as string[] | null,
      prospectKeys: undefined as string[] | undefined,
      keylessProspectIds: undefined as string[] | undefined,
      allowedDatasets: undefined as ExportDatasetKey[] | undefined,
      filters: filters as unknown,
      rowCounts: {
        accounts: summary?.filtered.accounts ?? 0,
        centers: summary?.filtered.centers ?? 0,
        services: summary?.filtered.services ?? 0,
        prospects: summary?.filtered.prospects ?? 0,
      } as Partial<Record<ExportDatasetKey, number>> | undefined,
    }
  }

  // A row selection exports only the selected entity's sheet, never the
  // related datasets. The dialog is locked to that single dataset; the
  // payload targets the selected keys directly and the dialog shows
  // selection-sized counts.
  const emptyData = { accounts: [], centers: [], services: [], prospects: [] }
  const snapshot = { ...(filters as object), selection: scope }

  if (scope.dataset === "centers") {
    return {
      data: emptyData,
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: [],
      centerKeys: scope.centerKeys,
      prospectKeys: undefined as string[] | undefined,
      keylessProspectIds: undefined as string[] | undefined,
      allowedDatasets: ["centers"] as ExportDatasetKey[],
      filters: undefined as unknown,
      rowCounts: { centers: scope.centerKeys.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
    }
  }

  if (scope.dataset === "prospects") {
    // Selected record ids are ps_unique_key when the row has one; keyless
    // rows use the "account::name::discriminator" composite id (see
    // getProspectRecordId), which the server matches directly.
    return {
      data: emptyData,
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: [],
      centerKeys: [],
      prospectKeys: scope.prospectIds.filter((id) => !id.includes("::")),
      keylessProspectIds: scope.prospectIds.filter((id) => id.includes("::")),
      allowedDatasets: ["prospects"] as ExportDatasetKey[],
      filters: undefined as unknown,
      rowCounts: { prospects: scope.prospectIds.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
    }
  }

  return {
    data: emptyData,
    isFiltered: true,
    filtersSnapshot: snapshot,
    accountNames: scope.accountNames,
    centerKeys: [],
    prospectKeys: undefined as string[] | undefined,
    keylessProspectIds: undefined as string[] | undefined,
    allowedDatasets: ["accounts"] as ExportDatasetKey[],
    filters: undefined as unknown,
    rowCounts: { accounts: scope.accountNames.length } as Partial<Record<ExportDatasetKey, number>> | undefined,
  }
}

/**
 * The export dialog: opening it for the full filtered export or a row
 * selection, the payload it sends, and the filter description it shows.
 * `describeFilterFields` is also used by the exports history dialog.
 */
export function useDashboardExport({
  canExport,
  filters,
  activeFiltersCount,
  summary,
  ranges,
  onExportCompleted,
}: UseDashboardExportParams) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportSelection | null>(null)
  /** Sheets ticked when the full export opens; undefined ticks every sheet. */
  const [startDatasets, setStartDatasets] = useState<ExportDatasetKey[] | undefined>(undefined)
  const scopeClearRef = useRef<number | null>(null)

  // Cancel any pending deferred scope clear so a freshly opened export can't be
  // reset by a timer scheduled when the previous dialog closed.
  const cancelPendingScopeClear = useCallback(() => {
    if (scopeClearRef.current !== null) {
      window.clearTimeout(scopeClearRef.current)
      scopeClearRef.current = null
    }
  }, [])

  // The full (filtered) export. From a table it starts with only that
  // table's sheet ticked; from the sidebar every sheet starts ticked.
  const openFullExport = useCallback(
    (startWith: ExportDatasetKey | null) => {
      if (!canExport) {
        return
      }
      cancelPendingScopeClear()
      setScope(null)
      setStartDatasets(startWith ? [startWith] : undefined)
      setOpen(true)
    },
    [canExport, cancelPendingScopeClear]
  )
  const handleExportAll = useCallback(() => openFullExport(null), [openFullExport])

  const handleDownloadSelection = useCallback(
    (selection: ExportSelection) => {
      const values =
        selection.dataset === "centers"
          ? selection.centerKeys
          : selection.dataset === "prospects"
            ? selection.prospectIds
            : selection.accountNames
      if (!canExport || values.length === 0) {
        return
      }
      cancelPendingScopeClear()
      setScope(selection)
      setOpen(true)
    },
    [canExport, cancelPendingScopeClear]
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        // Defer clearing the scope until the close animation (300ms) finishes,
        // otherwise the dialog briefly re-renders in its full multi-dataset form.
        cancelPendingScopeClear()
        scopeClearRef.current = window.setTimeout(() => {
          scopeClearRef.current = null
          setScope(null)
        }, SCOPE_CLEAR_DELAY_MS)
      }
    },
    [cancelPendingScopeClear]
  )

  useEffect(() => cancelPendingScopeClear, [cancelPendingScopeClear])

  // The filters a full export follows, described the way the sidebar shows them.
  const { lists: accountLists } = useAccountLists()
  const { revenue, yearsInIndia, centerIncYear } = ranges
  const describeFilterFields = useCallback(
    (source: unknown) => {
      if (!source || typeof source !== "object") return []
      const listNames = new Map(accountLists.map((list) => [list.id, list.name]))
      const bounds = { revenue, yearsInIndia, centerIncYear }
      return describeFilters(source as Partial<Filters>, bounds, listNames).flatMap((section) => section.fields)
    },
    [accountLists, revenue, yearsInIndia, centerIncYear]
  )
  const filterSummary = useMemo(() => describeFilterFields(filters), [describeFilterFields, filters])

  const payload = useMemo(
    () => buildExportPayload(scope, filters, activeFiltersCount, summary),
    [scope, filters, activeFiltersCount, summary]
  )

  const dialogProps: ComponentProps<typeof ExportDialog> = {
    open,
    onOpenChange: handleOpenChange,
    data: payload.data,
    isFiltered: payload.isFiltered,
    filtersSnapshot: payload.filtersSnapshot,
    accountNames: payload.accountNames,
    centerKeys: payload.centerKeys,
    prospectKeys: payload.prospectKeys,
    keylessProspectIds: payload.keylessProspectIds,
    filters: payload.filters,
    rowCounts: payload.rowCounts,
    allowedDatasets: payload.allowedDatasets,
    compact: Boolean(payload.allowedDatasets),
    initialDatasets: scope ? undefined : startDatasets,
    exportScope: scope ? "selection" : "all",
    filterSummary: scope ? undefined : filterSummary,
    onExportCompleted,
  }

  return { dialogProps, openFullExport, handleExportAll, handleDownloadSelection, describeFilterFields }
}
