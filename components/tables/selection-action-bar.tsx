"use client"

import { useEffect, useState } from "react"
import { Download, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SelectionActionBarProps {
  /** Whether the bar should be visible (e.g. in data view with rows selected). */
  show: boolean
  /** Number of selected rows. Held during the exit animation so it never flickers to 0. */
  count: number
  onClear: () => void
  onExport: () => void
  /** When provided, shows a bulk "favorite selected" action. */
  onFavorite?: () => void
  /** When true, the favorite button turns blue (the selection is already favorited). */
  favoriteActive?: boolean
}

/** Floating bottom-center bar for selective export. Animates in and out. */
export function SelectionActionBar({ show, count, onClear, onExport, onFavorite, favoriteActive }: SelectionActionBarProps) {
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
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{displayCount} selected</span>
        {onFavorite && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-2 rounded-full px-3 text-xs",
              favoriteActive && "text-blue-500 hover:text-blue-500"
            )}
            onClick={onFavorite}
          >
            <Star className={cn("h-3.5 w-3.5", favoriteActive && "fill-blue-500 text-blue-500")} />
            {favoriteActive ? "Favorited" : "Favorite"}
          </Button>
        )}
        <Button size="sm" className="h-8 gap-2 rounded-full px-4 text-xs" onClick={onExport}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>
    </div>
  )
}
