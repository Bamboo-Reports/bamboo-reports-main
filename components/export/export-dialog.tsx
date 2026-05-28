"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Building2, Briefcase, Users, Sparkles, CheckCircle2, Download } from "lucide-react"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import {
  requestServerExport,
  resolveExportDownloadUrl,
  type ServerExportResponse,
} from "@/lib/exports/request-client"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { toTrackedStringArray } from "@/lib/analytics/tracking"
import { getDatasetUnavailableMessage, isDatasetEnabled } from "@/lib/config/dashboard-access"
import { cn } from "@/lib/utils"

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
  /** Locked prospect teasers matching the current export scope. */
  lockedProspectsCount?: number
  onExportCompleted?: () => void
}

const DATASET_META: Array<{
  key: ExportDatasetKey
  label: string
  description: string
  icon: typeof Building2
  accent: string
}> = [
  {
    key: "accounts",
    label: "Accounts",
    description: "Legal names, HQ details, revenue ranges",
    icon: Building2,
    accent: "text-[hsl(var(--chart-1))]",
  },
  {
    key: "centers",
    label: "Centers",
    description: "Locations, type, employees, status",
    icon: Briefcase,
    accent: "text-[hsl(var(--chart-2))]",
  },
  {
    key: "services",
    label: "Services",
    description: "Service lines, focus, software stack",
    icon: Sparkles,
    accent: "text-[hsl(var(--chart-4))]",
  },
  {
    key: "prospects",
    label: "Prospects",
    description: "Decision makers, titles, departments",
    icon: Users,
    accent: "text-[hsl(var(--chart-3))]",
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
  lockedProspectsCount = 0,
  onExportCompleted,
}: ExportDialogProps) {
  const [selection, setSelection] = useState<Record<ExportDatasetKey, boolean>>({
    accounts: true,
    centers: true,
    services: true,
    prospects: true,
  })
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [displayedProgress, setDisplayedProgress] = useState(0)
  const [stage, setStage] = useState("Preparing export...")
  const [error, setError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<ServerExportResponse | null>(null)
  const wasOpenRef = useRef(false)
  const rafRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) {
      return
    }
    wasOpenRef.current = true

    const initialSelection = {
      accounts: isDatasetEnabled("accounts") && data.accounts.length > 0,
      centers: isDatasetEnabled("centers") && data.centers.length > 0,
      services: isDatasetEnabled("services") && data.services.length > 0,
      prospects: isDatasetEnabled("prospects") && data.prospects.length > 0,
    }
    setSelection(initialSelection)
    setIsExporting(false)
    setProgress(0)
    setDisplayedProgress(0)
    setStage("Preparing export...")
    setError(null)
    setExportResult(null)

    const initiallySelectedDatasets = getSelectedDatasets(initialSelection)

    captureEvent(ANALYTICS_EVENTS.EXPORT_DIALOG_OPENED, {
      is_filtered: isFiltered,
      row_count_accounts: data.accounts.length,
      row_count_centers: data.centers.length,
      row_count_services: data.services.length,
      row_count_prospects: data.prospects.length,
      row_count_locked_prospects: lockedProspectsCount,
      selected_datasets: initiallySelectedDatasets,
      selected_dataset_count: initiallySelectedDatasets.length,
    })
  }, [open, data, isFiltered, lockedProspectsCount])

  const totalSelected = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection]
  )
  const selectedRowCount = useMemo(
    () => (Object.keys(selection) as ExportDatasetKey[]).reduce(
      (total, key) => total + (selection[key] ? data[key].length : 0),
      0
    ),
    [selection, data]
  )
  const readinessItems = useMemo(
    () => DATASET_META.map((item) => ({
      ...item,
      count: selection[item.key] ? data[item.key].length : 0,
      selected: selection[item.key],
    })),
    [selection, data]
  )

  const handleToggle = (key: ExportDatasetKey) => {
    if (isExporting || !isDatasetEnabled(key)) return
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
      accounts: isDatasetEnabled("accounts") ? value : false,
      centers: isDatasetEnabled("centers") ? value : false,
      services: isDatasetEnabled("services") ? value : false,
      prospects: isDatasetEnabled("prospects") ? value : false,
    }
    setSelection(next)
    captureEvent(value ? ANALYTICS_EVENTS.EXPORT_SELECT_ALL_CLICKED : ANALYTICS_EVENTS.EXPORT_CLEAR_CLICKED, {
      selected_dataset_count: value ? 4 : 0,
      selected_datasets: value ? (Object.keys(next) as ExportDatasetKey[]) : [],
    })
  }

  const handleExport = async () => {
    if (isExporting || totalSelected === 0) return

    setIsExporting(true)
    setError(null)
    setProgress(0)
    setDisplayedProgress(0)
    setStage("Requesting export...")
    const startedAt = Date.now()
    const selectedDatasets = getSelectedDatasets(selection)

    captureEvent(ANALYTICS_EVENTS.EXPORT_STARTED, {
      selected_datasets: selectedDatasets,
      selected_dataset_count: selectedDatasets.length,
      is_filtered: isFiltered,
      row_count_accounts: selection.accounts ? data.accounts.length : 0,
      row_count_centers: selection.centers ? data.centers.length : 0,
      row_count_services: selection.services ? data.services.length : 0,
      row_count_prospects: selection.prospects ? data.prospects.length : 0,
      row_count_locked_prospects: selection.prospects ? lockedProspectsCount : 0,
    })

    // Fake but plausible progress ramp while the server is working. The
    // real work (DB fetch → XLSX → upload) is opaque to the client, so
    // we advance toward 90% gradually and jump to 100% on response.
    let rampCancelled = false
    const ramp = async () => {
      const stages: Array<{ to: number; stage: string; duration: number }> = [
        { to: 25, stage: "Fetching data from database", duration: 900 },
        { to: 65, stage: "Generating spreadsheet", duration: 2200 },
        { to: 88, stage: "Uploading archive", duration: 1400 },
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
        isFiltered,
        filtersApplied: filtersSnapshot ?? null,
      })
      rampCancelled = true
      await rampPromise.catch(() => undefined)

      setProgress(100)
      setStage("Export ready")
      setExportResult(result)

      captureEvent(ANALYTICS_EVENTS.EXPORT_COMPLETED, {
        selected_datasets: selectedDatasets,
        selected_dataset_count: selectedDatasets.length,
        is_filtered: isFiltered,
        duration_ms: Date.now() - startedAt,
      })
      onExportCompleted?.()
    } catch (err) {
      rampCancelled = true
      console.error("Export failed:", err)
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
    if (open && !nextOpen && !isExporting) {
      const selectedDatasets = getSelectedDatasets(selection)
      captureEvent(ANALYTICS_EVENTS.EXPORT_CANCELLED, {
        selected_dataset_count: totalSelected,
        selected_datasets: selectedDatasets,
        row_count_accounts: selection.accounts ? data.accounts.length : 0,
        row_count_centers: selection.centers ? data.centers.length : 0,
        row_count_services: selection.services ? data.services.length : 0,
        row_count_prospects: selection.prospects ? data.prospects.length : 0,
        row_count_locked_prospects: selection.prospects ? lockedProspectsCount : 0,
        stage: toTrackedStringArray([stage])[0] ?? null,
        has_error: Boolean(error),
      })
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Export data</DialogTitle>
          <DialogDescription>
            {isFiltered
              ? "You are exporting the filtered dataset across all pages."
              : "You are exporting the full dataset from the database."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/10 px-4 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>Selections</span>
              <Badge variant="secondary">{totalSelected} selected</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => handleSelectAll(true)}
                disabled={isExporting}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => handleSelectAll(false)}
                disabled={isExporting}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Export readiness summary</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedRowCount.toLocaleString()} rows will be included in this export.
                </p>
              </div>
              {selection.prospects && lockedProspectsCount > 0 ? (
                <Badge variant="outline" className="w-fit border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
                  {lockedProspectsCount.toLocaleString()} locked prospects excluded
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {readinessItems.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.key}
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      item.selected
                        ? "border-border/70 bg-background/70"
                        : "border-border/40 bg-background/30 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Icon className={cn("h-3.5 w-3.5", item.accent)} />
                      {item.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {item.count.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {DATASET_META.map((item) => {
              const Icon = item.icon
              const count = data[item.key].length
              const isChecked = selection[item.key]
              const isAccessible = isDatasetEnabled(item.key)

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleToggle(item.key)}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-left shadow-sm transition-all duration-150",
                    isChecked ? "border-primary/40 bg-primary/5" : "hover:border-muted-foreground/40",
                    (isExporting || !isAccessible) && "cursor-not-allowed opacity-70"
                  )}
                  disabled={isExporting || !isAccessible}
                >
                  <Checkbox checked={isChecked} disabled={isExporting || !isAccessible} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", item.accent)} />
                        <span className="text-sm font-semibold">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isAccessible && (
                          <Badge variant="secondary" className="text-[10px]">
                            Not Procured
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {count.toLocaleString()} rows
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAccessible ? item.description : getDatasetUnavailableMessage(item.key)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {exportResult ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-5 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold">Your file is ready</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {exportResult.filename}
                  {exportResult.totalRows > 0 && (
                    <span className="ml-1">({exportResult.totalRows.toLocaleString()} rows)</span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2"
                onClick={async () => {
                  try {
                    const url = await resolveExportDownloadUrl(exportResult.id)
                    window.open(url, "_self")
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to download export.")
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Download file
              </Button>
            </div>
          ) : (isExporting || error) ? (
            <div className="rounded-lg border bg-muted/20 p-4">
              {isExporting && (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{stage}</span>
                    <span className="tabular-nums">{Math.round(displayedProgress)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${displayedProgress}%` }}
                    />
                  </div>
                </>
              )}
              {error && <p className={isExporting ? "mt-2 text-xs text-destructive" : "text-xs text-destructive"}>{error}</p>}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {exportResult ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => setExportResult(null)}
              >
                Export again
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isExporting}
              >
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={isExporting || totalSelected === 0}>
                {isExporting ? "Exporting..." : "Export Selected"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
