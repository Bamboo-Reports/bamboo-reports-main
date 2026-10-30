"use client"

import React from 'react'
import Image from 'next/image'
import { RiRefreshLine, RiSearchLine, RiTerminalBoxLine } from "@remixicon/react"
import { Button } from '@/components/ui/button'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { getEnvironmentLabel } from '@/lib/config/environment'
import { NOTIFICATIONS_ENABLED } from '@/lib/config/notifications'

interface HeaderProps {
  onRefresh: () => void
  /** True while a refresh is in flight; spins the icon and blocks re-entry. */
  refreshing?: boolean
  onOpenSearch?: () => void
}

export const Header = React.memo(function Header({ onRefresh, refreshing = false, onOpenSearch }: HeaderProps): React.JSX.Element {
  const environmentLabel = getEnvironmentLabel()
  const environmentBadgeLabel = environmentLabel === "DEV" ? "DEV" : null

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto w-full px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-background">
              <Image
                src="/logo.svg"
                alt="Bamboo Reports logo"
                fill
                sizes="40px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-bold text-foreground">Bamboo Reports</p>
                {environmentBadgeLabel ? (
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <RiTerminalBoxLine className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-mono text-[10px] font-bold uppercase leading-none tracking-widest text-amber-700 dark:text-amber-300">
                      {environmentBadgeLabel}
                    </span>
                  </div>
                ) : null}
              </div>
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
