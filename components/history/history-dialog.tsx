"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { RiCloseLine, RiDeleteBinLine, RiHistoryLine, RiSearchLine } from "@remixicon/react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LibraryEmpty, LibraryGroupLabel } from "@/components/filters/library-dialog"
import { cn } from "@/lib/utils"
import { ENTITY_TYPE_META } from "@/lib/dashboard/entity-display"
import { describeWhen, groupByDay } from "@/lib/utils/day-groups"
import type { RecentItem } from "@/hooks/use-recent-items"
import type { SearchResultType } from "@/lib/search"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

const UNDO_WINDOW_MS = 10_000

type TypeFilter = "all" | SearchResultType

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "account", label: "Accounts" },
  { id: "center", label: "Centres" },
  { id: "prospect", label: "Prospects" },
]

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recentItems: RecentItem[]
  onItemSelect: (item: RecentItem) => void
  onClearHistory: () => void
  /** Removes one record from History. */
  onRemoveItem: (item: RecentItem) => void
  /** Puts back the list as it was before a clear or a remove (the Undo on the toast). */
  onRestoreHistory: (items: RecentItem[]) => void
}

/** History: records you opened, grouped by day. Click one to open it again. */
export function HistoryDialog({
  open,
  onOpenChange,
  recentItems,
  onItemSelect,
  onClearHistory,
  onRemoveItem,
  onRestoreHistory,
}: HistoryDialogProps) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<TypeFilter>("all")
  const searchRef = useRef<HTMLInputElement>(null)

  // Each opening starts on everything, with nothing typed.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setType("all")
  }, [open])

  const counts = useMemo(() => {
    const out: Record<TypeFilter, number> = { all: recentItems.length, account: 0, center: 0, prospect: 0 }
    for (const item of recentItems) out[item.type] += 1
    return out
  }, [recentItems])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recentItems.filter(
      (item) => (type === "all" || item.type === type) && (!q || `${item.title} ${item.subtitle}`.toLowerCase().includes(q))
    )
  }, [recentItems, query, type])

  const withUndo = (message: string, before: RecentItem[]) =>
    // Longer than the 4s default so there is time to reach Undo.
    toast(message, { duration: UNDO_WINDOW_MS, action: { label: "Undo", onClick: () => onRestoreHistory(before) } })

  const clearAll = () => {
    const before = recentItems
    captureEvent(ANALYTICS_EVENTS.HISTORY_CLEARED, { record_count: before.length })
    onClearHistory()
    withUndo("History cleared", before)
  }

  const removeOne = (item: RecentItem) => {
    const before = recentItems
    onRemoveItem(item)
    withUndo(`Removed ${item.title} from History`, before)
  }

  const empty = recentItems.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Focus the search box, not the first button: that is Clear history,
        // so Enter right after opening would wipe it (#311).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchRef.current?.focus()
        }}
        className="flex h-[min(620px,88vh)] w-[calc(100%-2rem)] max-w-[680px] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-3 pr-12">
          <div className="flex min-h-[30px] items-center gap-2.5">
            <DialogTitle className="text-base">History</DialogTitle>
            {!empty && <span className="text-[12.5px] text-muted-foreground">{plural(recentItems.length, "record")}</span>}
            <span className="flex-1" />
            {!empty && (
              <Button variant="ghost-destructive" size="sm" onClick={clearAll}>
                <RiDeleteBinLine />
                Clear history
              </Button>
            )}
          </div>
          <DialogDescription className="sr-only">Records you have opened. Click one to open it again.</DialogDescription>
        </DialogHeader>

        {empty ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-xs">
              <RiHistoryLine className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No history yet</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Accounts, centres and prospects you open from the dashboard will appear here, so you can get back to them quickly.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-2 px-5 pb-1.5 pt-3">
              <label className="flex h-[34px] items-center gap-2 rounded-lg border border-transparent bg-muted/80 px-2.5 text-muted-foreground transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
                <RiSearchLine className="h-4 w-4 shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search history"
                  aria-label="Search history"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-4 rounded-lg bg-muted/80 p-[3px]" role="tablist" aria-label="Record type">
                {TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    role="tab"
                    aria-selected={type === filter.id}
                    onClick={() => setType(filter.id)}
                    className={cn(
                      "h-7 rounded-md px-1 text-[12.5px] font-medium transition-colors",
                      type === filter.id
                        ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--border)/0.6)]"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {filter.label}
                    <span className="ml-1 text-[11.5px] tabular-nums text-muted-foreground">{counts[filter.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [--library-group-bg:hsl(var(--background))]">
              {visible.length === 0 ? (
                <LibraryEmpty>{query.trim() ? <>Nothing matches &ldquo;{query.trim()}&rdquo;.</> : "Nothing of this type yet."}</LibraryEmpty>
              ) : (
                groupByDay(visible, (item) => item.viewedAt).map(({ group, rows }) => (
                  <div key={group}>
                    <LibraryGroupLabel>{group}</LibraryGroupLabel>
                    {rows.map((item) => {
                      const meta = ENTITY_TYPE_META[item.type]
                      const Icon = meta.icon
                      return (
                        <div key={`${item.type}:${item.id}`} className="group relative">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenChange(false)
                              onItemSelect(item)
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground">
                              <Icon className="h-[15px] w-[15px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{item.title}</span>
                              {item.subtitle && <span className="block truncate text-[12px] text-muted-foreground">{item.subtitle}</span>}
                            </span>
                            <span className="hidden w-16 shrink-0 text-[12px] text-muted-foreground sm:block">{meta.label}</span>
                            <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground group-focus-within:invisible group-hover:invisible">
                              {describeWhen(item.viewedAt).short}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOne(item)}
                            aria-label={`Remove ${item.title} from History`}
                            title="Remove from History"
                            className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-focus-within:opacity-100 group-hover:opacity-100"
                          >
                            <RiCloseLine className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
