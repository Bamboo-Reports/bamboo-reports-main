"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { RiDeleteBinLine, RiTimeLine } from "@remixicon/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { cn } from "@/lib/utils"
import { getPaginatedData } from "@/lib/utils/helpers"
import { ENTITY_TYPE_META, formatTimeAgo } from "@/lib/dashboard/entity-display"
import type { RecentItem } from "@/hooks/use-recent-items"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

const ITEMS_PER_PAGE = 10
const UNDO_WINDOW_MS = 10_000

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recentItems: RecentItem[]
  onItemSelect: (item: RecentItem) => void
  onClearHistory: () => void
  /** Restores the items that were just cleared (the Undo on the "History cleared" toast). */
  onRestoreHistory: (items: RecentItem[]) => void
}

export function HistoryDialog({
  open,
  onOpenChange,
  recentItems,
  onItemSelect,
  onClearHistory,
  onRestoreHistory,
}: HistoryDialogProps) {
  const [page, setPage] = useState(1)
  const contentRef = useRef<HTMLDivElement>(null)
  const paginated = getPaginatedData(recentItems, page, ITEMS_PER_PAGE) as RecentItem[]

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setPage(1) }}>
      <DialogContent
        ref={contentRef}
        // Focus the dialog itself, not its first button: that is Clear history,
        // so Enter right after opening would wipe it (#311).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
        className="h-screen w-screen max-w-none overflow-hidden rounded-none p-0 sm:max-w-none glassmorphism-dialog flex flex-col"
      >
        <DialogHeader className="border-b border-border/60 px-6 py-5 shrink-0">
          <div className="flex items-start justify-between pr-10">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <RiTimeLine className="h-4 w-4" />
                </div>
                History
              </DialogTitle>
              <DialogDescription className="mt-1">
                Records you have recently opened. Click any item to reopen it.
              </DialogDescription>
            </div>
            {recentItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const cleared = recentItems
                  captureEvent(ANALYTICS_EVENTS.HISTORY_CLEARED, { record_count: cleared.length })
                  onClearHistory()
                  // Longer than the 4s default so there is time to reach Undo.
                  toast("History cleared", {
                    duration: UNDO_WINDOW_MS,
                    action: { label: "Undo", onClick: () => onRestoreHistory(cleared) },
                  })
                }}
              >
                <RiDeleteBinLine className="h-3.5 w-3.5" />
                Clear history
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-6">
          {recentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 py-24 text-center backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
              <RiTimeLine className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">No history yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Records you open from the dashboard will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm dark:bg-white/5 dark:border-white/10">
              <div className="divide-y divide-border/40">
                {paginated.map((item) => {
                  const meta = ENTITY_TYPE_META[item.type]
                  const Icon = meta.icon
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      type="button"
                      onClick={() => {
                        onOpenChange(false)
                        onItemSelect(item)
                      }}
                      className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background/60", meta.borderClass)}>
                        <Icon className={cn("h-4 w-4", meta.iconClass)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{item.subtitle}</p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px] font-medium", meta.badgeClass)}
                      >
                        {meta.label}
                      </Badge>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground w-16 text-right">
                        {formatTimeAgo(item.viewedAt)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <PaginationControls
                currentPage={page}
                totalItems={recentItems.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setPage}
                dataLength={paginated.length}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
