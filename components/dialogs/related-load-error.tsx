"use client"

import { RiRefreshLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"

interface RelatedLoadErrorProps {
  message: string
  onRetry: () => void
}

/** Inline notice for a record dialog whose related data failed to load. */
export function RelatedLoadError({ message, onRetry }: RelatedLoadErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
    >
      <span className="text-muted-foreground">{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0 gap-1.5">
        <RiRefreshLine className="h-4 w-4" />
        Retry
      </Button>
    </div>
  )
}
