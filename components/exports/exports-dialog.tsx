"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  RiArrowRightSLine,
  RiBriefcaseLine,
  RiBuildingLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiFileExcel2Line,
  RiGroupLine,
  RiSparklingLine,
} from "@remixicon/react"
import { devError } from "@/lib/utils/dev-log"
import { Button } from "@/components/ui/button"
import {
  LibraryDialog,
  LibraryEmpty,
  LibraryGroupLabel,
  LibraryItem,
  LibraryPaneHeader,
  LibraryPaneTitle,
} from "@/components/filters/library-dialog"
import type { DescribedField } from "@/components/filters/filter-description"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { resolveExportDownloadUrl } from "@/lib/exports/request-client"
import {
  datasetLabel,
  describeUserAgent,
  describeWhen,
  exportTitle,
  formatBytes,
  groupByDay,
  orderDatasets,
  selectionSummary,
} from "@/lib/exports/history"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

type ExportRow = {
  id: string
  created_at: string
  filename: string
  file_size_bytes: number
  datasets: string[]
  row_counts: Record<string, number>
  total_rows: number
  is_filtered: boolean
  filters_applied?: unknown
  client_ip: string | null
  user_agent: string | null
}

const SHEET_ICONS: Record<string, typeof RiBuildingLine> = {
  accounts: RiBuildingLine,
  centers: RiBriefcaseLine,
  services: RiSparklingLine,
  prospects: RiGroupLine,
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`

function formatIp(ip: string | null): string | null {
  if (!ip) return null
  if (ip === "::1" || ip === "127.0.0.1") return `${ip} (this computer)`
  return ip
}

function fieldText(field: DescribedField): string {
  if (field.text) return field.text
  return (field.values ?? []).map((v) => (v.mode === "exclude" ? `not ${v.value}` : v.value)).join(", ")
}

interface ExportsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Describes an export's saved filters the way the sidebar does. */
  describeFilters?: (filters: unknown) => DescribedField[]
}

/** My exports: every export you made, grouped by day, with its sheets, filters and a download. */
export function ExportsDialog({ open, onOpenChange, describeFilters }: ExportsDialogProps) {
  const [exports, setExports] = useState<ExportRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const fetchExports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("You are signed out. Sign in again to see your exports.")
        setExports([])
        return
      }
      const res = await fetch(`/api/exports?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) {
        setError(`The server returned an error (${res.status}).`)
        setExports([])
        return
      }
      const payload = await res.json()
      const rows: ExportRow[] = payload.exports ?? []
      setExports(rows)
      captureEvent(ANALYTICS_EVENTS.EXPORTS_HISTORY_OPENED, { exports_count: rows.length })
    } catch (err) {
      devError(err)
      setError("Check your connection and try again.")
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  // Each opening loads the latest exports and starts on the newest one.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setSelectedId(null)
    setDownloadError(null)
    void fetchExports()
  }, [open, fetchExports])

  const describe = useCallback(
    (row: ExportRow): { selection: string | null; fields: DescribedField[] } => {
      const selection = selectionSummary(row.filters_applied)
      if (selection || !row.is_filtered || !row.filters_applied || !describeFilters) return { selection, fields: [] }
      return { selection, fields: describeFilters(row.filters_applied) }
    },
    [describeFilters]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return exports
    return exports.filter((row) => {
      const { selection, fields } = describe(row)
      const haystack = [
        exportTitle(row.datasets),
        row.filename,
        describeWhen(row.created_at).long,
        selection ?? "",
        ...fields.map((f) => `${f.label} ${fieldText(f)}`),
      ]
      return haystack.some((text) => text.toLowerCase().includes(q))
    })
  }, [exports, query, describe])
  const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null

  const handleDownload = async (row: ExportRow) => {
    setDownloadingId(row.id)
    setDownloadError(null)
    try {
      const url = await resolveExportDownloadUrl(row.id)
      window.open(url, "_self")
      const createdAt = Date.parse(row.created_at)
      captureEvent(ANALYTICS_EVENTS.EXPORT_DOWNLOAD_CLICKED, {
        export_id: row.id,
        source: "exports_history",
        export_age_hours: Number.isNaN(createdAt)
          ? null
          : Math.max(0, Math.round(((Date.now() - createdAt) / 3_600_000) * 10) / 10),
      })
    } catch (err) {
      devError(err)
      captureEvent(ANALYTICS_EVENTS.EXPORT_DOWNLOAD_FAILED, {
        export_id: row.id,
        source: "exports_history",
        error_message: err instanceof Error ? err.message : "Unknown download error",
      })
      setDownloadError(err instanceof Error ? err.message : "The download did not start. Try again.")
    } finally {
      setTimeout(() => setDownloadingId(null), 1500)
    }
  }

  const renderItems = () => {
    if (loading && !loaded) {
      return Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2.5">
          <div className="skeleton-loading h-4 w-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-loading h-3 w-3/5 rounded" />
            <div className="skeleton-loading h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))
    }
    if (visible.length === 0) {
      if (query.trim()) return <LibraryEmpty>No exports match &ldquo;{query.trim()}&rdquo;.</LibraryEmpty>
      return error ? null : <LibraryEmpty>Your exports will appear here.</LibraryEmpty>
    }
    return groupByDay(visible, (row) => row.created_at).map(({ group, rows }) => (
      <div key={group}>
        <LibraryGroupLabel>{group}</LibraryGroupLabel>
        {rows.map((row) => (
          <LibraryItem
            key={row.id}
            selected={selected?.id === row.id}
            onSelect={() => {
              setSelectedId(row.id)
              setDownloadError(null)
            }}
            icon={<RiFileExcel2Line className="h-4 w-4" />}
            name={exportTitle(row.datasets)}
            meta={`${describeWhen(row.created_at).short} · ${plural(row.total_rows, "row")}`}
          />
        ))}
      </div>
    ))
  }

  const renderDetail = () => {
    if (error) {
      return (
        <div className="grid flex-1 place-items-center p-8 text-center" role="alert">
          <div>
            <RiErrorWarningLine className="mx-auto h-7 w-7 text-exclude" />
            <p className="mt-2 text-sm font-semibold">Could not load your exports</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void fetchExports()}>
              Try again
            </Button>
          </div>
        </div>
      )
    }
    if (loading && !loaded) {
      return (
        <div className="space-y-3 p-5">
          <div className="skeleton-loading h-4 w-48 rounded" />
          <div className="skeleton-loading h-3 w-64 rounded" />
        </div>
      )
    }
    if (!selected) {
      if (exports.length > 0) return null
      return (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-xs">
            <RiFileExcel2Line className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">No exports yet</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Use Export in the filters panel to download the dashboard as an Excel file. Every export is kept here so you can download it again.
            </p>
          </div>
        </div>
      )
    }

    const datasets = orderDatasets(selected.datasets)
    const { selection, fields } = describe(selected)
    const browser = describeUserAgent(selected.user_agent)
    const ip = formatIp(selected.client_ip)
    return (
      <>
        <LibraryPaneHeader
          title={<LibraryPaneTitle>{exportTitle(selected.datasets)}</LibraryPaneTitle>}
          meta={[describeWhen(selected.created_at).long, plural(selected.total_rows, "row"), formatBytes(selected.file_size_bytes)].join(" · ")}
          actions={
            <Button size="sm" onClick={() => handleDownload(selected)} loading={downloadingId === selected.id}>
              {downloadingId === selected.id ? null : <RiDownloadLine />}
              Download
            </Button>
          }
        />
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {downloadError && (
            <p className="rounded-lg bg-exclude/[0.06] px-3 py-2 text-[12.5px] text-exclude" role="alert">
              {downloadError}
            </p>
          )}
          <section>
            <h4 className="mb-1.5 text-[12px] font-medium text-muted-foreground">Sheets</h4>
            <div className="text-[13px]">
              {datasets.map((key) => {
                const Icon = SHEET_ICONS[key] ?? RiFileExcel2Line
                return (
                  <div key={key} className="flex items-center gap-2 border-b border-border/60 py-[7px]">
                    <Icon className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                    <span className="flex-1">{datasetLabel(key)}</span>
                    <span className="font-medium tabular-nums">{(selected.row_counts?.[key] ?? 0).toLocaleString()}</span>
                  </div>
                )
              })}
              {datasets.length > 1 && (
                <div className="flex items-center gap-2 py-[7px] font-semibold">
                  <span className="w-[15px] shrink-0" />
                  <span className="flex-1">Total</span>
                  <span className="tabular-nums">{selected.total_rows.toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[12px] font-medium text-muted-foreground">Filters it followed</h4>
            {selection ? (
              <p className="text-[12.5px]">Only the {selection} you selected.</p>
            ) : !selected.is_filtered ? (
              <p className="text-[12.5px] text-muted-foreground">No filters. Everything shown on the dashboard at the time.</p>
            ) : fields.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {fields.map((field) => (
                  <span
                    key={field.label}
                    className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-card px-2 text-[12px] font-medium"
                    title={`${field.label}: ${fieldText(field)}`}
                  >
                    <span className="shrink-0 font-normal text-muted-foreground">{field.label}</span>
                    <span className="truncate">{fieldText(field)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Filtered, but the filters were not recorded for this export.</p>
            )}
          </section>

          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <RiArrowRightSLine className="h-4 w-4 transition-transform group-open:rotate-90" />
              Request details
            </summary>
            <dl className="mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
              <dt className="text-muted-foreground">File name</dt>
              <dd className="break-all font-mono text-[12px]">{selected.filename}</dd>
              <dt className="text-muted-foreground">IP address</dt>
              <dd className="font-mono text-[12px]">{ip ?? "Not recorded"}</dd>
              <dt className="text-muted-foreground">Browser</dt>
              <dd title={selected.user_agent ?? undefined}>{browser ?? "Not recorded"}</dd>
            </dl>
          </details>
        </div>
      </>
    )
  }

  return (
    <LibraryDialog
      open={open}
      onOpenChange={onOpenChange}
      title="My exports"
      titleMeta={loaded && !error && exports.length > 0 ? plural(exports.length, "export") : undefined}
      description="Every export you have made, with its sheets and filters. Download any of them again."
      searchPlaceholder="Search exports"
      query={query}
      onQueryChange={setQuery}
      items={renderItems()}
    >
      {renderDetail()}
    </LibraryDialog>
  )
}
