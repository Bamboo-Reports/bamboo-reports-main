"use client"

import { useEffect, useState } from "react"
import { RiCloseLine, RiDownloadLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

interface SelectionActionBarProps {
  /** Entity name reported with selection analytics. */
  entity: "account" | "center" | "prospect"
  /** Whether the bar should be visible (e.g. in data view with rows selected). */
  show: boolean
  /** Number of selected rows. Held during the exit animation so it never flickers to 0. */
  count: number
  onClear: () => void
  onExport: () => void
  /**
   * Rows matching the filters, set once the whole page is selected and more
   * rows exist. The bar then points at the full Export, which already covers
   * every matching row, instead of offering a cross-page selection.
   */
  matchingCount?: number
  onExportAll?: () => void
}

/** Floating bottom-center bar for selective export. Animates in and out. */
export function SelectionActionBar({
  entity,
  show,
  count,
  onClear,
  onExport,
  matchingCount,
  onExportAll,
}: SelectionActionBarProps) {
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [displayCount, setDisplayCount] = useState(0)

  useEffect(() => {
    if (show) {
      setMounted(true)
      setExiting(false)
      setDisplayCount(count)
      return
    }
    if (!mounted) return
    setExiting(true)
    const timeout = setTimeout(() => {
      setMounted(false)
      setExiting(false)
    }, 200)
    return () => clearTimeout(timeout)
  }, [show, count, mounted])

  if (!mounted) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={
          "pointer-events-auto flex items-center gap-3 rounded-full border bg-background/70 px-4 py-2 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-background/60 ease-out " +
          (exiting
            ? "animate-out fade-out slide-out-to-bottom-4 duration-200"
            : "animate-in fade-in slide-in-from-bottom-4 duration-300")
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.ROW_SELECTION_CLEARED, { entity, selected_count: count })
            onClear()
          }}
          aria-label="Clear selection"
        >
          <RiCloseLine className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{displayCount} selected</span>
        {matchingCount !== undefined && onExportAll && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.SELECTION_EXPORT_ALL_CLICKED, {
                entity,
                selected_count: count,
                matching_count: matchingCount,
              })
              onExportAll()
            }}
          >
            Need all {matchingCount.toLocaleString()}? Export all
          </Button>
        )}
        <Button size="sm" className="rounded-full px-4" onClick={() => {
            captureEvent(ANALYTICS_EVENTS.SELECTION_EXPORT_CLICKED, { entity, selected_count: count })
            onExport()
          }}>
          <RiDownloadLine className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>
    </div>
  )
}
