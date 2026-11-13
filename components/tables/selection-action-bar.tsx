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
  // False for the first frame after mounting, so the enter is a transition from
  // the hidden state (interruptible, unlike a keyframe that restarts from zero).
  const [entered, setEntered] = useState(false)
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
      setEntered(false)
    }, 150)
    return () => clearTimeout(timeout)
  }, [show, count, mounted])

  useEffect(() => {
    if (!mounted || entered) return
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [mounted, entered])

  if (!mounted) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center px-4">
      <div
        data-mounted={entered && !exiting ? "" : undefined}
        className={
          "pointer-events-auto flex items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-float transition-[opacity,transform] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0 " +
          (entered && !exiting ? "translate-y-0 opacity-100 duration-200" : "translate-y-4 opacity-0 duration-150")
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.ROW_SELECTION_CLEARED, { entity, selected_count: count })
            onClear()
          }}
          aria-label="Clear selection"
        >
          <RiCloseLine className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">{displayCount.toLocaleString()} selected</span>
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
        <Button size="sm" onClick={() => {
            captureEvent(ANALYTICS_EVENTS.SELECTION_EXPORT_CLICKED, { entity, selected_count: count })
            onExport()
          }}>
          <RiDownloadLine className="h-4 w-4" />
          Export
        </Button>
      </div>
    </div>
  )
}
