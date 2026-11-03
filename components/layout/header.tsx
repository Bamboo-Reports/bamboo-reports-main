"use client"

import React from 'react'
import Image from 'next/image'
import { RiRefreshLine, RiSearchLine } from "@remixicon/react"
import { Button } from '@/components/ui/button'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { getEnvironmentLabel } from '@/lib/config/environment'
import { NOTIFICATIONS_ENABLED } from '@/lib/config/notifications'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onRefresh: () => void
  /** True while a refresh is in flight; spins the icon and blocks re-entry. */
  refreshing?: boolean
  onOpenSearch?: () => void
}

export const Header = React.memo(function Header({ onRefresh, refreshing = false, onOpenSearch }: HeaderProps): React.JSX.Element {
  // On the development site the name reads "Bamboo Reports Dev" and the logo gets an amber dot.
  const isDev = getEnvironmentLabel() === "DEV"
  const devHint = "Development site: for testing changes before they go live. Data and accounts may differ from the live Bamboo Reports."

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto w-full px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0">
              <div
                className={cn(
                  "relative h-full w-full overflow-hidden rounded-xl border bg-background",
                  isDev ? "border-amber-500/50" : "border-primary/20"
                )}
              >
                <Image
                  src="/logo.svg"
                  alt="Bamboo Reports logo"
                  fill
                  sizes="40px"
                  className="object-contain p-1"
                  priority
                />
              </div>
              {isDev && (
                <span
                  aria-hidden
                  className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background dark:bg-amber-400"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-foreground">
                Bamboo Reports
                {isDev && (
                  <span className="ml-1.5 cursor-default font-medium text-amber-600 dark:text-amber-400" title={devHint}>
                    Dev
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-tour="header-actions">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search (⌘K)"
                aria-label="Open search"
                className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-muted-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-56"
              >
                <RiSearchLine className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left text-xs">Search…</span>
              </button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              title={refreshing ? 'Refreshing…' : 'Refresh'}
              aria-label={refreshing ? 'Refreshing data' : 'Refresh data'}
            >
              <RiRefreshLine className={refreshing ? 'animate-spin' : undefined} />
            </Button>
            {NOTIFICATIONS_ENABLED ? <NotificationDropdown /> : null}
          </div>
        </div>
      </div>
    </header>
  )
})
