"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { devError } from "@/lib/utils/dev-log"
import { Checkbox } from "@/components/ui/checkbox"
import { TruncatedText } from "@/components/ui/truncated-text"
import { RiBriefcaseLine, RiBuildingLine, RiCheckboxCircleFill, RiDownloadLine, RiErrorWarningFill, RiGroupLine, RiSparklingLine } from "@remixicon/react"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import {
  requestServerExport,
  resolveExportDownloadUrl,
  type ServerExportResponse,
} from "@/lib/exports/request-client"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { toTrackedStringArray } from "@/lib/analytics/tracking"
import { cn } from "@/lib/utils"
import type { DescribedField } from "@/components/filters/filter-description"

type ExportData = {
  accounts: object[]
  centers: object[]
  services: object[]
  prospects: object[]
}

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ExportData
  isFiltered: boolean
  filtersSnapshot?: unknown
  /** Account global legal names to include; null = all accounts. */
  accountNames?: string[] | null
  /** Center cn_unique_keys to include; null = all centers. */
  centerKeys?: string[] | null
  /** Prospect ps_unique_keys to include; null = filter prospects by accountNames instead. */
  prospectKeys?: string[] | null
  /** Prospect composite row ids for selected prospects that do not have ps_unique_key. */
  keylessProspectIds?: string[] | null
  /**
   * Export-by-filter (#249): dashboard filter state sent to the server, which
   * builds the export through the filter engine (key lists are ignored).
   */
  filters?: unknown
  /**
   * Server-mode row counts per dataset (the client no longer holds the
   * filtered arrays). Used instead of data[key].length for display/enablement.
   */
  rowCounts?: Partial<Record<ExportDatasetKey, number>> | null
  /** When set, restricts the dialog to these datasets (e.g. a single-sheet selection export). */
  allowedDatasets?: ExportDatasetKey[]
  /**
   * When set, only these datasets start ticked; the others stay available to
   * add. Used when the export is opened from one table.
   */
  initialDatasets?: ExportDatasetKey[]
  /** Compact single-dataset layout for selection exports (no dataset picker). */
  compact?: boolean
  /** Whether the dialog exports the whole (filtered) dataset or a row selection; analytics only. */
  exportScope?: "all" | "selection"
  /** The filters the export follows, as the sidebar describes them; shown as chips. */
  filterSummary?: DescribedField[]
  onExportCompleted?: () => void
}

const SINGULAR: Record<ExportDatasetKey, string> = { accounts: "account", centers: "centre", services: "service", prospects: "prospect" }

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`

/** "Bengaluru, Pune" or "not Pune" for values; the text as is for ranges and switches. */
function fieldText(field: DescribedField): string {
  if (field.text) return field.text
  return (field.values ?? []).map((v) => (v.mode === "exclude" ? `not ${v.value}` : v.value)).join(", ")
}

const DATASET_META: Array<{
  key: ExportDatasetKey
  label: string
  description: string
  icon: typeof RiBuildingLine
}> = [
  {
    key: "accounts",
    label: "Accounts",
    description: "Legal names, HQ details, revenue ranges",
    icon: RiBuildingLine,
  },
  {
    key: "centers",
    label: "Centres",
    description: "Locations, type, employees, status",
    icon: RiBriefcaseLine,
  },
  {
    key: "services",
    label: "Services",
    description: "Service lines, focus, software stack",
    icon: RiSparklingLine,
  },
  {
    key: "prospects",
    label: "Prospects",
    description: "Decision makers, titles, departments",
    icon: RiGroupLine,
  },
]

export function ExportDialog({
  open,
  onOpenChange,
  data,
  isFiltered,
  filtersSnapshot,
  accountNames,
  centerKeys,
  prospectKeys,
  keylessProspectIds,
  filters,
  rowCounts,
  allowedDatasets,
  initialDatasets,
  compact = false,
  exportScope = "all",
  filterSummary = [],
  onExportCompleted,
}: ExportDialogProps) {
  const countOf = (key: ExportDatasetKey) => rowCounts?.[key] ?? data[key].length
  const [selection, setSelection] = useState<Record<ExportDatasetKey, boolean>>({
    accounts: true,
    centers: true,
    services: true,
    prospects: true,
  })
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [displayedProgress, setDisplayedProgress] = useState(0)
  const [stage, setStage] = useState("Preparing export")
  const [error, setError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<ServerExportResponse | null>(null)
  // Result is held back until the progress bar visually fills to 100%.
  const [isComplete, setIsComplete] = useState(false)
  const [showAllFilters, setShowAllFilters] = useState(false)
  const wasOpenRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (exportResult && progress >= 100 && displayedProgress >= 100) {
      setIsComplete(true)
    }
  }, [exportResult, progress, displayedProgress])

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setDisplayedProgress((current) => {
        if (current === progress) {
          rafRef.current = null
          return current
        }
        // Tween at ~140%/second. helper emits ramped ticks so we just
        // need to glide the last pixels between them.
        const step = (dt / 1000) * 140
        const diff = progress - current
        if (Math.abs(diff) <= step) return progress
        const next = current + Math.sign(diff) * step
        rafRef.current = requestAnimationFrame(tick)
        return next
      })
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [progress])

  const getSelectedDatasets = (currentSelection: Record<ExportDatasetKey, boolean>) =>
    (Object.keys(currentSelection) as ExportDatasetKey[]).filter((dataset) => currentSelection[dataset])

  const isDatasetAllowed = (key: ExportDatasetKey) => !allowedDatasets || allowedDatasets.includes(key)
  const visibleDatasetMeta = useMemo(
    () => (allowedDatasets ? DATASET_META.filter((meta) => allowedDatasets.includes(meta.key)) : DATASET_META),
    [allowedDatasets]
  )

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) {
      return
    }
    wasOpenRef.current = true

    const allow = (key: ExportDatasetKey) =>
      (!allowedDatasets || allowedDatasets.includes(key)) && (!initialDatasets || initialDatasets.includes(key))
    const initialSelection = {
      accounts: allow("accounts") && countOf("accounts") > 0,
      centers: allow("centers") && countOf("centers") > 0,
      services: allow("services") && countOf("services") > 0,
      prospects: allow("prospects") && countOf("prospects") > 0,
    }
    setSelection(initialSelection)
    setIsExporting(false)
    setProgress(0)
    setDisplayedProgress(0)
    setStage("Preparing export")
    setError(null)
    setExportResult(null)
    setIsComplete(false)
    setShowAllFilters(false)

    const initiallySelectedDatasets = getSelectedDatasets(initialSelection)

    captureEvent(ANALYTICS_EVENTS.EXPORT_DIALOG_OPENED, {
      is_filtered: isFiltered,
      row_count_accounts: countOf("accounts"),
      row_count_centers: countOf("centers"),
      row_count_services: countOf("services"),
      row_count_prospects: countOf("prospects"),
      selected_datasets: initiallySelectedDatasets,
      selected_dataset_count: initiallySelectedDatasets.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, rowCounts, isFiltered, allowedDatasets, initialDatasets])

  const totalSelected = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection]
  )
  const selectedRowCount = useMemo(
    () => (Object.keys(selection) as ExportDatasetKey[]).reduce(
      (total, key) => total + (selection[key] ? countOf(key) : 0),
      0
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, data, rowCounts]
  )
  const handleToggle = (key: ExportDatasetKey) => {
    if (isExporting) return
    const next = { ...selection, [key]: !selection[key] }
    setSelection(next)
    const selectedDatasets = getSelectedDatasets(next)
    captureEvent(ANALYTICS_EVENTS.EXPORT_SELECTION_CHANGED, {
      changed_dataset: key,
      is_selected: next[key],
      selected_datasets: selectedDatasets,
      selected_dataset_count: selectedDatasets.length,
    })
  }

  const handleSelectAll = (value: boolean) => {
    if (isExporting) return
    const next = {
      accounts: isDatasetAllowed("accounts") ? value : false,
      centers: isDatasetAllowed("centers") ? value : false,
      services: isDatasetAllowed("services") ? value : false,
      prospects: isDatasetAllowed("prospects") ? value : false,
    }
    setSelection(next)
    // Report the datasets actually toggled on, not a hardcoded count: with
    // a limited set of allowed datasets a "select all" can enable fewer than four.
    const nextSelectedDatasets = getSelectedDatasets(next)
    captureEvent(value ? ANALYTICS_EVENTS.EXPORT_SELECT_ALL_CLICKED : ANALYTICS_EVENTS.EXPORT_CLEAR_CLICKED, {
      selected_dataset_count: nextSelectedDatasets.length,
      selected_datasets: nextSelectedDatasets,
    })
  }

  const handleExport = async () => {
    if (isExporting || totalSelected === 0) return

    setIsExporting(true)
    setError(null)
    setProgress(0)
    setDisplayedProgress(0)
    setIsComplete(false)
    setStage("Requesting export")
    const startedAt = Date.now()
    const selectedDatasets = getSelectedDatasets(selection)

    captureEvent(ANALYTICS_EVENTS.EXPORT_STARTED, {
      selected_datasets: selectedDatasets,
      selected_dataset_count: selectedDatasets.length,
      is_filtered: isFiltered,
      row_count_accounts: selection.accounts ? countOf("accounts") : 0,
      row_count_centers: selection.centers ? countOf("centers") : 0,
      row_count_services: selection.services ? countOf("services") : 0,
      row_count_prospects: selection.prospects ? countOf("prospects") : 0,
    })

    // Fake but plausible progress ramp while the server is working. The
    // real work (DB fetch → XLSX → upload) is opaque to the client, so
    // we advance toward 90% gradually and jump to 100% on response.
    let rampCancelled = false
    const ramp = async () => {
      const stages: Array<{ to: number; stage: string; duration: number }> = [
        { to: 25, stage: "Fetching data", duration: 900 },
        { to: 65, stage: "Generating spreadsheet", duration: 2200 },
        { to: 88, stage: "Saving the file", duration: 1400 },
      ]
      let current = 0
      for (const s of stages) {
        const steps = Math.max(6, Math.round(s.duration / 80))
        const stepDelay = s.duration / steps
        setStage(s.stage)
        for (let i = 1; i <= steps; i++) {
          if (rampCancelled) return
          const next = current + ((s.to - current) * i) / steps
          setProgress(next)
          await new Promise((r) => setTimeout(r, stepDelay))
        }
        current = s.to
      }
    }

    try {
      const rampPromise = ramp()
      const result = await requestServerExport({
        datasets: selectedDatasets,
        accountNames: isFiltered ? accountNames ?? null : null,
        centerKeys: isFiltered ? centerKeys ?? null : null,
        prospectKeys: isFiltered ? prospectKeys ?? null : null,
        keylessProspectIds: isFiltered ? keylessProspectIds ?? null : null,
        filters: filters ?? null,
        isFiltered,
        filtersApplied: filtersSnapshot ?? null,
      })
      rampCancelled = true
      await rampPromise.catch(() => undefined)

      setProgress(100)
      setStage("Export ready")
      setExportResult(result)

      captureEvent(ANALYTICS_EVENTS.EXPORT_COMPLETED, {
        export_id: result.id,
        total_rows: result.totalRows,
        export_scope: exportScope,
        selected_datasets: selectedDatasets,
        selected_dataset_count: selectedDatasets.length,
        is_filtered: isFiltered,
        duration_ms: Date.now() - startedAt,
      })
      onExportCompleted?.()
    } catch (err) {
      rampCancelled = true
      devError("Export failed:", err)
      const message = err instanceof Error ? err.message : "Export failed. Please try again."
      setError(message)
      captureEvent(ANALYTICS_EVENTS.EXPORT_FAILED, {
        selected_datasets: selectedDatasets,
        selected_dataset_count: selectedDatasets.length,
        is_filtered: isFiltered,
        duration_ms: Date.now() - startedAt,
        error_message: err instanceof Error ? err.message : "Unknown export error",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    // Closing after a finished export is not a cancellation
    if (open && !nextOpen && !isExporting && !exportResult) {
      const selectedDatasets = getSelectedDatasets(selection)
      captureEvent(ANALYTICS_EVENTS.EXPORT_CANCELLED, {
        selected_dataset_count: totalSelected,
        selected_datasets: selectedDatasets,
        row_count_accounts: selection.accounts ? countOf("accounts") : 0,
        row_count_centers: selection.centers ? countOf("centers") : 0,
        row_count_services: selection.services ? countOf("services") : 0,
        row_count_prospects: selection.prospects ? countOf("prospects") : 0,
        stage: toTrackedStringArray([stage])[0] ?? null,
        has_error: Boolean(error),
      })
    }
    onOpenChange(nextOpen)
  }

  const handleDownload = async () => {
    if (!exportResult) return
    captureEvent(ANALYTICS_EVENTS.EXPORT_DOWNLOAD_CLICKED, {
      export_id: exportResult.id,
      source: "export_dialog",
      total_rows: exportResult.totalRows,
    })
    try {
      const url = await resolveExportDownloadUrl(exportResult.id)
      window.open(url, "_self")
    } catch (err) {
      captureEvent(ANALYTICS_EVENTS.EXPORT_DOWNLOAD_FAILED, {
        export_id: exportResult.id,
        source: "export_dialog",
        error_message: err instanceof Error ? err.message : "Unknown download error",
      })
      setError(err instanceof Error ? err.message : "Could not download the export")
    }
  }

  const resetToChoose = () => {
    setExportResult(null)
    setIsComplete(false)
    setError(null)
    setProgress(0)
    setDisplayedProgress(0)
  }

  // After the server responds we keep showing the progress bar until it
  // visually fills, only then revealing the download view.
  const showResult = Boolean(exportResult) && isComplete
  const fillingBar = isExporting || (Boolean(exportResult) && !isComplete)
  const locked = fillingBar || showResult
  const sheetCount = totalSelected

  // Progress, the finished file and errors all live in the footer, so the
  // window keeps its size from start to finish.
  const footer = (
    <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3 sm:flex-nowrap">
      {fillingBar ? (
        <>
          <div className="min-w-0 flex-1" role="status" aria-live="polite">
            <div className="flex justify-between text-xs">
              <span>{stage}</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(displayedProgress)}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${displayedProgress / 100})` }} />
            </div>
          </div>
        </>
      ) : showResult && exportResult ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2.5" role="status">
            <RiCheckboxCircleFill className="h-5 w-5 shrink-0 text-include" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Ready to download</p>
              <p className="truncate text-xs tabular-nums text-muted-foreground">
                {plural(exportResult.totalRows, "row")}
                {compact ? "" : ` · ${plural(sheetCount, "sheet")}`} · Excel file
              </p>
            </div>
          </div>
          {!compact && (
            <Button variant="ghost" onClick={resetToChoose}>
              Export again
            </Button>
          )}
          <Button onClick={handleDownload}>
            <RiDownloadLine />
            Download
          </Button>
        </>
      ) : error ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px]" role="alert">
            <RiErrorWarningFill className="h-5 w-5 shrink-0 text-exclude" />
            <div className="min-w-0">
              <p className="font-medium">The export did not finish</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={totalSelected === 0}>
            Try again
          </Button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-[13px] tabular-nums text-muted-foreground">
            {totalSelected === 0 ? (
              "Pick at least one dataset"
            ) : (
              <>
                <span className="font-medium text-foreground">{plural(selectedRowCount, "row")}</span>
                {compact ? "" : ` in ${plural(sheetCount, "sheet")}`} · Excel file
              </>
            )}
          </p>
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={totalSelected === 0}>
            <RiDownloadLine />
            Export
          </Button>
        </>
      )}
    </div>
  )

  if (compact) {
    const meta = visibleDatasetMeta[0]
    const noun = meta ? SINGULAR[meta.key] : "row"
    return (
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-[440px] grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1 px-5 pb-4 pt-5 pr-12 text-left">
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">
              Export {plural(selectedRowCount, noun)}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Only the rows you selected in the {meta?.label ?? "data"} table
            </DialogDescription>
          </DialogHeader>
          {footer}
        </DialogContent>
      </Dialog>
    )
  }

  const allOn = visibleDatasetMeta.every((item) => selection[item.key])
  const shownFilters = showAllFilters ? filterSummary : filterSummary.slice(0, 2)
  const hiddenFilters = filterSummary.length - shownFilters.length

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-[560px] grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 px-5 pb-4 pt-5 pr-12 text-left">
          <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">Export data</DialogTitle>
          <DialogDescription className="text-[13px]">
            {isFiltered
              ? "Exports the filtered data across all pages, not just the rows on screen"
              : "Exports everything shown on the dashboard, with no filters applied"}
          </DialogDescription>
          {isFiltered && filterSummary.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              {shownFilters.map((field) => (
                <span
                  key={field.label}
                  className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-card px-2 text-xs font-medium"
                >
                  <span className="shrink-0 font-normal text-muted-foreground">{field.label}</span>
                  <TruncatedText text={fieldText(field)} />
                </span>
              ))}
              {hiddenFilters > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllFilters(true)}
                  className="inline-flex h-6 items-center rounded-md border border-dashed px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  +{hiddenFilters} more
                </button>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="border-t">
          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-xs text-muted-foreground">
            <span>Sheets in the file</span>
            <button
              type="button"
              onClick={() => handleSelectAll(!allOn)}
              disabled={locked}
              className="font-medium text-primary hover:underline hover:underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
            >
              {allOn ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="px-2 pb-3">
            {visibleDatasetMeta.map((item) => {
              const Icon = item.icon
              const isChecked = selection[item.key]
              const checkboxId = `export-dataset-${item.key}`

              // A label rather than a button: the checkbox is itself a button,
              // and buttons cannot nest. Clicking anywhere on the row toggles it.
              return (
                <label
                  key={item.key}
                  htmlFor={checkboxId}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    locked ? "cursor-default" : "cursor-pointer hover:bg-muted/60"
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isChecked}
                    onCheckedChange={() => handleToggle(item.key)}
                    disabled={locked}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("flex items-center gap-1.5 text-[13px] font-medium", !isChecked && "text-muted-foreground")}>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <span className={cn("whitespace-nowrap text-[13px] font-medium tabular-nums", !isChecked && "text-muted-foreground")}>
                    {countOf(item.key).toLocaleString()} <span className="font-normal text-muted-foreground">rows</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {footer}
      </DialogContent>
    </Dialog>
  )
}
