"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SelectionActionBarProps {
  /** Whether the bar should be visible (e.g. in data view with rows selected). */
  show: boolean
  /** Number of selected rows. Held during the exit animation so it never flickers to 0. */
  count: number
  onClear: () => void
  onExport: () => void
}

/** Floating bottom-center bar for selective export. Animates in and out. */
export function SelectionActionBar({ show, count, onClear, onExport }: SelectionActionBarProps) {
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
        <span className="text-sm font-medium">{displayCount} selected</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={onClear}>
            Clear
          </Button>
          <Button size="sm" className="h-8 gap-2 rounded-full px-4 text-xs" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>
    </div>
  )
}
