"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, Eye, FileArchive, Loader2, MoreHorizontal } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type ExportRow = {
  id: string
  created_at: string
  filename: string
  file_size_bytes: number
  datasets: string[]
  row_counts: Record<string, number>
  total_rows: number
  is_filtered: boolean
  client_ip: string | null
  user_agent: string | null
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function formatIp(ip: string | null): string {
  if (!ip) return "—"
  if (ip === "::1" || ip === "127.0.0.1") return `${ip} (localhost)`
  return ip
}

interface ExportsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportsDialog({ open, onOpenChange }: ExportsDialogProps) {
  const [exports, setExports] = useState<ExportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [detailsRow, setDetailsRow] = useState<ExportRow | null>(null)

  const fetchExports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Not signed in.")
        setExports([])
        return
      }
      const res = await fetch(`/api/exports?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!res.ok) {
        setError(`Failed to load exports (${res.status}).`)
        setExports([])
        return
      }
      const payload = await res.json()
      setExports(payload.exports ?? [])
    } catch (err) {
      console.error(err)
      setError("Failed to load exports.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchExports()
  }, [open, fetchExports])

  const handleDownload = async (row: ExportRow) => {
    setDownloadingId(row.id)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError("Session expired.")
        return
      }
      const url = `/api/exports/${row.id}/download?access_token=${encodeURIComponent(token)}`
      window.open(url, "_self")
    } finally {
      setTimeout(() => setDownloadingId(null), 1500)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-screen w-screen max-w-none overflow-hidden rounded-none p-0 sm:max-w-none glassmorphism-dialog flex flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-5 shrink-0">
            <div className="pr-10">
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <FileArchive className="h-4 w-4" />
                </div>
                My Exports
              </DialogTitle>
              <DialogDescription className="mt-1">
                A record of every export you&apos;ve generated. Files are archived and can be re-downloaded.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-6 py-6">
            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {loading && exports.length === 0 && (
              <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading exports...
              </div>
            )}

            {!loading && exports.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 py-24 text-center backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
                <FileArchive className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">No exports yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your past exports will appear here after you generate one from the dashboard.
                </p>
              </div>
            )}

            {exports.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Date</TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Datasets</TableHead>
                      <TableHead className="w-[100px] text-right">Size</TableHead>
                      <TableHead className="w-[60px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exports.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(row.created_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.filename}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.datasets.map((d) => (
                              <Badge
                                key={d}
                                variant="secondary"
                                className="text-[10px] capitalize"
                              >
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {formatBytes(row.file_size_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={downloadingId === row.id}
                                aria-label="Export actions"
                              >
                                {downloadingId === row.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onSelect={() => setDetailsRow(row)}
                                className="cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleDownload(row)}
                                className="cursor-pointer"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ExportDetailsDialog
        row={detailsRow}
        onOpenChange={(next) => {
          if (!next) setDetailsRow(null)
        }}
        onDownload={(r) => handleDownload(r)}
        isDownloading={(id) => downloadingId === id}
      />
    </>
  )
}

function ExportDetailsDialog({
  row,
  onOpenChange,
  onDownload,
  isDownloading,
}: {
  row: ExportRow | null
  onOpenChange: (open: boolean) => void
  onDownload: (row: ExportRow) => void
  isDownloading: (id: string) => boolean
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl glassmorphism-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <FileArchive className="h-4 w-4" />
            </div>
            Export details
          </DialogTitle>
          <DialogDescription>
            Full audit record for this export.
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-5">
            <section className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm p-4 dark:bg-white/5 dark:border-white/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                File
              </p>
              <div className="space-y-2 text-sm">
                <DetailRow label="Filename" value={<span className="font-mono text-xs">{row.filename}</span>} />
                <DetailRow label="Size" value={formatBytes(row.file_size_bytes)} />
                <DetailRow label="Exported at" value={formatDate(row.created_at)} />
                <DetailRow
                  label="Scope"
                  value={row.is_filtered ? "Filtered dataset" : "Full dataset"}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm p-4 dark:bg-white/5 dark:border-white/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Row counts
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {row.datasets.map((d) => (
                  <div
                    key={d}
                    className="rounded-lg border border-border/50 bg-background/50 px-3 py-2 dark:bg-white/5"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground capitalize">
                      {d}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {(row.row_counts?.[d] ?? 0).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">{row.total_rows.toLocaleString()}</span>
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm p-4 dark:bg-white/5 dark:border-white/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Request context
              </p>
              <div className="space-y-2 text-sm">
                <DetailRow label="IP address" value={<span className="font-mono text-xs">{formatIp(row.client_ip)}</span>} />
                <DetailRow
                  label="User agent"
                  value={
                    <span className="font-mono text-[11px] break-all text-right max-w-[400px] block">
                      {row.user_agent ?? "—"}
                    </span>
                  }
                />
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => onDownload(row)}
                disabled={isDownloading(row.id)}
                className="gap-1.5"
              >
                {isDownloading(row.id) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/30 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}
