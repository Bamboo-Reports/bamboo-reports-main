"use client"

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { RiRefreshLine, RiSearchLine } from "@remixicon/react"
import { Button } from '@/components/ui/button'
import { HintTooltip } from '@/components/ui/tooltip'
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
  const devHint = "For testing changes before they go live. Data and accounts may differ from the live Bamboo Reports."
  // Set after mount so the server render and the first client render match.
  const [shortcut, setShortcut] = useState("Ctrl K")
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("\u2318K")
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background">
      <div className="mx-auto w-full px-6 py-3">
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
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background dark:bg-amber-400"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-foreground">
                Bamboo Reports
                {isDev && (
                  <HintTooltip label="Development site" hint={devHint} side="bottom">
                    <span
                      role="img"
                      tabIndex={0}
                      className="ml-1.5 cursor-default rounded-sm font-medium text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
                    >
                      Dev
                    </span>
                  </HintTooltip>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-tour="header-actions">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                aria-label="Open search"
                className="hidden sm:inline-flex h-8 items-center gap-2 rounded-lg border border-border/60 bg-muted/30 pl-3 pr-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-muted-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-56"
              >
                <RiSearchLine className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Search</span>
                <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-[5px] border bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground">
                  {shortcut}
                </kbd>
              </button>
            )}
            <HintTooltip label={refreshing ? 'Refreshing data' : 'Refresh data'} side="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                disabled={refreshing}
                aria-busy={refreshing}
                aria-label={refreshing ? 'Refreshing data' : 'Refresh data'}
              >
                <RiRefreshLine className={refreshing ? 'animate-spin' : undefined} />
              </Button>
            </HintTooltip>
            {NOTIFICATIONS_ENABLED ? <NotificationDropdown /> : null}
          </div>
        </div>
      </div>
    </header>
  )
})
