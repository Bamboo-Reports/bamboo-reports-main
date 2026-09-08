"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowLeft, CheckCircle2, FileSpreadsheet, HelpCircle, Loader2, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AccountPicker, type AccountPickerOption } from "@/components/filters/account-picker"
import { cn } from "@/lib/utils"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { normalizeTrackedText } from "@/lib/analytics/tracking"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { fetchAccountMatches } from "@/lib/dashboard/api-client"
import { MAX_MATCH_NAMES, type AccountMatchCandidate, type AccountMatchResult, type AccountMatchStatus } from "@/lib/accounts/account-match"
import { extractNames, guessNameColumn, parseDelimitedText, tableFromRows, type ParsedAccountTable } from "@/lib/accounts/account-list-parser"
import { devError } from "@/lib/utils/dev-log"
import type { Filters } from "@/lib/types"

interface AccountListUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Persists the filter; resolves true on success. */
  onSave: (name: string, filters: Filters) => Promise<boolean>
  /** Applies the filter to the dashboard right away (used by "Save and apply"). */
  onApply?: (filters: Filters) => void
  saving?: boolean
}

type ReviewRow = {
  input: string
  status: AccountMatchStatus
  auto: AccountMatchCandidate | null
  candidates: AccountMatchCandidate[]
  /** The account the row currently maps to; null means unmapped (skipped on save). */
  selected: string | null
}

type Step = "input" | "review"

const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xls"]

async function readSpreadsheet(file: File): Promise<ParsedAccountTable> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [], hasHeader: false }
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    const values = Array.isArray(row.values) ? row.values : []
    // ExcelJS row.values is 1-based; index 0 is always empty.
    for (let i = 1; i < values.length; i += 1) cells.push(cellToString(values[i]))
    rows.push(cells)
  })
  return tableFromRows(rows)
}

function cellToString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: unknown }
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("")
    if (v.text != null) return cellToString(v.text)
    if (v.result != null) return cellToString(v.result)
  }
  return ""
}

function toPickerOptions(candidates: AccountMatchCandidate[]): AccountPickerOption[] {
  return candidates.map((c) => ({
    name: c.name,
    matchedAlias: c.aliasValue ? { field: "alias", value: c.aliasValue } : null,
    visibility: c.visibility,
  }))
}

function rowsFromResults(results: AccountMatchResult[]): ReviewRow[] {
  return results.map((r) => ({
    input: r.input,
    status: r.status,
    auto: r.match,
    candidates: r.candidates,
    selected: r.match?.name ?? null,
  }))
}

const STATUS_META: Record<AccountMatchStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  matched: { label: "Matched", className: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300", Icon: CheckCircle2 },
  review: { label: "Needs review", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: HelpCircle },
  not_found: { label: "Not found", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300", Icon: XCircle },
}

function viaLabel(candidate: AccountMatchCandidate | null): string | null {
  if (!candidate) return null
  if (candidate.via === "alias") return candidate.aliasValue ? `matched via alias "${candidate.aliasValue}"` : "matched via alias"
  if (candidate.via === "normalized") return "matched ignoring legal suffix"
  return null
}

export function AccountListUploadDialog({ open, onOpenChange, onSave, onApply, saving = false }: AccountListUploadDialogProps) {
  const [step, setStep] = useState<Step>("input")
  const [fileName, setFileName] = useState<string | null>(null)
  const [table, setTable] = useState<ParsedAccountTable | null>(null)
  const [column, setColumn] = useState(0)
  const [pasted, setPasted] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filterName, setFilterName] = useState("")
  const [statusFilter, setStatusFilter] = useState<AccountMatchStatus | "all">("all")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const reset = useCallback(() => {
    setStep("input")
    setFileName(null)
    setTable(null)
    setColumn(0)
    setPasted("")
    setParseError(null)
    setMatching(false)
    setRows([])
    setFilterName("")
    setStatusFilter("all")
    setDragging(false)
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_UPLOAD_OPENED, {})
  }, [open, reset])

  const names = useMemo(() => {
    if (table) return extractNames(table, column)
    if (pasted.trim()) return extractNames(parseDelimitedText(pasted), 0)
    return []
  }, [table, column, pasted])

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    const lower = file.name.toLowerCase()
    if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setParseError("Unsupported file type. Upload a CSV, TSV, TXT or XLSX file.")
      return
    }
    try {
      const parsed = lower.endsWith(".xlsx") || lower.endsWith(".xls") ? await readSpreadsheet(file) : parseDelimitedText(await file.text())
      if (parsed.rows.length === 0) {
        setParseError("The file has no rows to import.")
        return
      }
      setTable(parsed)
      setColumn(guessNameColumn(parsed))
      setFileName(file.name)
      setPasted("")
      if (!filterName) setFilterName(file.name.replace(/\.[^.]+$/, ""))
    } catch (err) {
      devError("account list parse failed:", err)
      setParseError("Could not read that file. Try saving it as CSV and uploading again.")
    }
  }, [filterName])

  const handleMatch = useCallback(async () => {
    if (names.length === 0) return
    setMatching(true)
    try {
      const { results } = await fetchAccountMatches(names.slice(0, MAX_MATCH_NAMES))
      const nextRows = rowsFromResults(results)
      setRows(nextRows)
      setStep("review")
      const counts = countByStatus(nextRows)
      captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_MATCHED, {
        source: fileName ? "file" : "paste",
        uploaded_count: names.length,
        matched_count: counts.matched,
        review_count: counts.review,
        not_found_count: counts.not_found,
      })
    } catch (err) {
      devError("account list match failed:", err)
      toast.error(err instanceof Error ? err.message : "Could not match the account list. Please try again.")
    } finally {
      setMatching(false)
    }
  }, [names, fileName])

  const updateRow = useCallback((index: number, selected: string | null) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, selected } : row)))
  }, [])

  const counts = useMemo(() => countByStatus(rows), [rows])
  const mappedNames = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of rows) {
      if (!row.selected) continue
      const key = row.selected.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(row.selected)
    }
    return out
  }, [rows])
  const unmappedCount = rows.filter((r) => !r.selected).length

  const visibleRows = useMemo(
    () => rows.map((row, index) => ({ row, index })).filter(({ row }) => statusFilter === "all" || row.status === statusFilter),
    [rows, statusFilter]
  )

  const buildFilters = useCallback(
    (listName: string): Filters => ({
      ...createDefaultFilters({
        accountVisibilityMode: "all",
        accountNameValues: mappedNames.map((value) => ({ value, mode: "include" as const })),
      }),
      accountListName: listName,
    }),
    [mappedNames]
  )

  const handleSave = useCallback(
    async (apply: boolean) => {
      const name = filterName.trim()
      if (!name || mappedNames.length === 0) return
      const filters = buildFilters(name)
      const ok = await onSave(name, filters)
      if (!ok) {
        toast.error("Could not save the filter. Please try again.")
        return
      }
      captureEvent(ANALYTICS_EVENTS.ACCOUNT_LIST_FILTER_SAVED, {
        saved_filter_name: normalizeTrackedText(name),
        uploaded_count: rows.length,
        mapped_count: mappedNames.length,
        unmapped_count: unmappedCount,
        applied: apply,
      })
      if (apply && onApply) onApply(filters)
      toast.success(
        unmappedCount > 0
          ? `Saved "${name}" with ${mappedNames.length} accounts (${unmappedCount} skipped).`
          : `Saved "${name}" with ${mappedNames.length} accounts.`
      )
      onOpenChange(false)
    },
    [filterName, mappedNames, buildFilters, onSave, rows.length, unmappedCount, onApply, onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] w-[calc(100%-2rem)] overflow-x-hidden overflow-y-auto", step === "review" ? "max-w-4xl" : "max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{step === "input" ? "Upload account list" : "Review account matches"}</DialogTitle>
          {step === "input" ? (
            <DialogDescription className="sr-only">Upload an account list file or paste account names.</DialogDescription>
          ) : (
            <DialogDescription>
              Confirm the mapping for each uploaded name. Rows without a selected account are left out of the saved filter.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "input" ? (
          <div className="min-w-0 space-y-4 py-1">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void handleFile(file)
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-accent/30"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ""
                }}
              />
              {fileName ? (
                <>
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                  <p className="max-w-full truncate text-sm font-medium" title={fileName}>{fileName}</p>
                  <p className="text-xs text-muted-foreground">Click or drop another file to replace it</p>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop a file here or click to browse</p>
                  <p className="text-xs text-muted-foreground">CSV, TSV, TXT or XLSX. Up to {MAX_MATCH_NAMES} names per upload.</p>
                </>
              )}
            </div>

            {table && table.headers.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="account-list-column">Column with account names</Label>
                <select
                  id="account-list-column"
                  value={column}
                  onChange={(e) => setColumn(Number(e.target.value))}
                  className="flex h-9 w-full max-w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {table.headers.map((header, i) => (
                    <option key={`${header}-${i}`} value={i}>
                      {header || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!table && (
              <div className="space-y-1.5">
                <Label htmlFor="account-list-paste">Or paste account names, one per line</Label>
                <textarea
                  id="account-list-paste"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={6}
                  placeholder={"Infosys Ltd\nTata Consultancy Services\nAccenture"}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            {parseError && (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </p>
            )}

            {names.length > 0 && (
              <div className="min-w-0 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{Math.min(names.length, MAX_MATCH_NAMES)}</span> unique names ready to match
                {names.length > MAX_MATCH_NAMES && (
                  <span className="text-muted-foreground"> (only the first {MAX_MATCH_NAMES} will be used)</span>
                )}
                <p className="mt-1 truncate text-xs text-muted-foreground" title={names.slice(0, 5).join(", ")}>
                  {names.slice(0, 5).join(", ")}
                  {names.length > 5 ? ", ..." : ""}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="min-w-0 space-y-4 py-1">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "matched", "review", "not_found"] as const).map((key) => {
                const count = key === "all" ? rows.length : counts[key]
                const active = statusFilter === key
                const label = key === "all" ? "All" : STATUS_META[key].label
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                      !active && key !== "all" && STATUS_META[key].className
                    )}
                  >
                    {label} <span className="opacity-80">({count})</span>
                  </button>
                )
              })}
              <span className="ml-auto text-xs text-muted-foreground">
                {mappedNames.length} account{mappedNames.length === 1 ? "" : "s"} will be saved
              </span>
            </div>

            <div className="max-h-[46vh] min-w-0 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Uploaded name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Account in database</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No rows in this group.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map(({ row, index }) => {
                      const meta = STATUS_META[row.status]
                      const hint = viaLabel(row.auto)
                      return (
                        <tr key={`${row.input}-${index}`} className="border-t align-top">
                          <td className="max-w-[240px] px-3 py-2">
                            <span className="block truncate font-medium" title={row.input}>
                              {row.input}
                            </span>
                            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Badge variant="outline" className={cn("gap-1 font-medium", meta.className)}>
                              <meta.Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <AccountPicker
                              value={row.selected}
                              onChange={(name) => updateRow(index, name)}
                              suggestions={toPickerOptions(row.candidates)}
                              placeholder={row.status === "not_found" ? "Search to map manually" : "Select account"}
                              ariaLabel={`Account for ${row.input}`}
                            />
                            {row.candidates.length > 0 && !row.selected && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {row.candidates.slice(0, 3).map((c) => (
                                  <button
                                    key={c.name}
                                    type="button"
                                    onClick={() => updateRow(index, c.name)}
                                    className="max-w-[220px] truncate rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                                    title={c.aliasValue ? `${c.name} (known as ${c.aliasValue})` : c.name}
                                  >
                                    {c.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-list-filter-name">Save as filter</Label>
              <Input
                id="account-list-filter-name"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="e.g., Acme target accounts Q4"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "input" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleMatch} disabled={names.length === 0 || matching}>
                {matching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Matching...
                  </>
                ) : (
                  "Match accounts"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("input")} disabled={saving} className="sm:mr-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={!filterName.trim() || mappedNames.length === 0 || saving}>
                {saving ? "Saving..." : "Save filter"}
              </Button>
              {onApply && (
                <Button onClick={() => handleSave(true)} disabled={!filterName.trim() || mappedNames.length === 0 || saving}>
                  Save and apply
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function countByStatus(rows: ReviewRow[]): Record<AccountMatchStatus, number> {
  const counts: Record<AccountMatchStatus, number> = { matched: 0, review: 0, not_found: 0 }
  for (const row of rows) counts[row.status] += 1
  return counts
}
