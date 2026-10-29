import React, { useEffect, useRef, useState } from 'react'
import { RiBriefcaseLine, RiBuildingLine, RiGroupLine, RiTimeLine, RiUserFollowLine } from "@remixicon/react"
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getSectionUnavailableMessage, isSectionEnabled } from '@/lib/config/dashboard-access'
import { cn } from '@/lib/utils'

// Truncate to one decimal instead of rounding, so 2,459 reads as 2.4K (not 2.5K)
// and the compact value never overstates the real count.
function truncateToOneDecimal(val: number): string {
  const truncated = Math.floor(val * 10) / 10
  return truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(1)
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${truncateToOneDecimal(num / 1_000_000)}M`
  }
  if (num >= 1_000) {
    return `${truncateToOneDecimal(num / 1_000)}K`
  }
  return num.toLocaleString()
}

const SummaryNumber = React.memo(function SummaryNumber({
  value,
  compact = false,
  className,
}: {
  value: number
  compact?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'text-2xl lg:text-[1.625rem] font-semibold leading-tight tracking-tight',
        className
      )}
    >
      {compact ? formatCompactNumber(value) : value.toLocaleString()}
    </span>
  )
})

interface SummaryCardsProps {
  filteredAccountsCount: number
  totalAccountsCount: number
  filteredCentersCount: number
  totalCentersCount: number
  filteredUpcomingCentersCount: number
  totalUpcomingCentersCount: number
  filteredProspectsCount: number
  totalProspectsCount: number
  filteredHeadcount: number
  totalHeadcount: number
  activeView: "accounts" | "centers" | "prospects"
  onSelect: (view: "accounts" | "centers" | "prospects") => void
  /** A newer filter state is loading; the shown numbers are the previous state's. */
  updating?: boolean
}

// Millions always read compact so "value of total" fits on one line at the
// narrowest five-column width.
function formatCount(num: number, compact: boolean): string {
  return compact || num >= 1_000_000 ? formatCompactNumber(num) : num.toLocaleString()
}

export const SummaryCards = React.memo(function SummaryCards({
  filteredAccountsCount,
  totalAccountsCount,
  filteredCentersCount,
  totalCentersCount,
  filteredUpcomingCentersCount,
  totalUpcomingCentersCount,
  filteredProspectsCount,
  totalProspectsCount,
  filteredHeadcount,
  totalHeadcount,
  activeView,
  onSelect,
  updating = false,
}: SummaryCardsProps): React.JSX.Element {
  const accountsEnabled = isSectionEnabled("accounts")
  const centersEnabled = isSectionEnabled("centers")
  const prospectsEnabled = isSectionEnabled("prospects")
  const [compact, setCompact] = useState(false)
  const basePixelRatioRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio : 1)

  useEffect(() => {
    const baseDpr = basePixelRatioRef.current
    const check = () => {
      const zoomLevel = window.devicePixelRatio / baseDpr
      const sidebar = document.getElementById('filters-sidebar')
      const sidebarOpen = sidebar ? sidebar.getBoundingClientRect().width > 100 : false
      setCompact(zoomLevel > 1.1 || sidebarOpen)
    }
    check()
    window.addEventListener('resize', check)
    const sidebar = document.getElementById('filters-sidebar')
    let resizeObserver: ResizeObserver | null = null
    if (sidebar) {
      resizeObserver = new ResizeObserver(check)
      resizeObserver.observe(sidebar)
      sidebar.addEventListener('transitionend', check)
    }
    return () => {
      window.removeEventListener('resize', check)
      resizeObserver?.disconnect()
      sidebar?.removeEventListener('transitionend', check)
    }
  }, [])
  const cards = [
    {
      id: 'accounts' as const,
      title: 'Accounts',
      value: filteredAccountsCount,
      total: totalAccountsCount,
      icon: RiBuildingLine,
      iconClassName: 'text-primary',
      interactive: accountsEnabled,
      procured: accountsEnabled,
      message: accountsEnabled ? null : getSectionUnavailableMessage("accounts"),
    },
    {
      id: 'centers' as const,
      title: 'Centres',
      value: filteredCentersCount,
      total: totalCentersCount,
      icon: RiBriefcaseLine,
      iconClassName: 'text-primary',
      interactive: centersEnabled,
      procured: centersEnabled,
      message: centersEnabled ? null : getSectionUnavailableMessage("centers"),
    },
    {
      id: 'upcoming-centers' as const,
      title: 'Upcoming Centres',
      value: filteredUpcomingCentersCount,
      total: totalUpcomingCentersCount,
      icon: RiTimeLine,
      iconClassName: 'text-primary',
      interactive: false,
      procured: centersEnabled,
      message: centersEnabled
        ? "Upcoming Centres is an overview stat. Only Accounts, Centres, and Prospects open as views."
        : getSectionUnavailableMessage("centers"),
    },
    {
      id: 'prospects' as const,
      title: 'Prospects',
      value: filteredProspectsCount,
      total: totalProspectsCount,
      icon: RiGroupLine,
      iconClassName: 'text-primary',
      interactive: prospectsEnabled,
      procured: prospectsEnabled,
      message: prospectsEnabled ? null : getSectionUnavailableMessage("prospects"),
    },
    {
      id: 'headcount' as const,
      title: 'Headcount',
      value: filteredHeadcount,
      total: totalHeadcount,
      icon: RiUserFollowLine,
      iconClassName: 'text-primary',
      interactive: false,
      procured: centersEnabled,
      message: centersEnabled
        ? "Headcount is an overview stat. Only Accounts, Centres, and Prospects open as views."
        : getSectionUnavailableMessage("centers"),
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6" aria-label="Dashboard sections" data-tour="summary-cards">
      {cards.map((card) => {
        const Icon = card.icon
        const isActive = card.interactive && activeView === card.id
        return (
          <Card
            key={card.title}
            role={card.interactive ? "button" : undefined}
            tabIndex={card.interactive ? 0 : undefined}
            aria-pressed={card.interactive ? activeView === card.id : undefined}
            onClick={(() => {
              if (card.interactive) {
                return () => onSelect(card.id as "accounts" | "centers" | "prospects")
              }
              const message = card.message
              if (!message) return undefined
              return () => toast.info(message, { id: `summary-readonly-${card.id}` })
            })()}
            onKeyDown={card.interactive ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(card.id as "accounts" | "centers" | "prospects")
              }
            } : undefined}
            className={cn(
              'relative overflow-hidden border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-[box-shadow,border-color] duration-200 ease-out animate-stagger',
              card.id === 'headcount' && 'col-span-2 md:col-span-1',
              card.interactive && 'cursor-pointer select-none',
              !card.interactive && card.message && 'cursor-help',
              isActive
                ? 'border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.6),0_1px_2px_hsl(214_45%_15%/0.06),0_4px_12px_-4px_hsl(214_45%_15%/0.08)] dark:border-primary/60 dark:shadow-[0_0_0_1px_hsl(var(--primary)/0.6),0_1px_2px_hsl(0_0%_0%/0.4)]'
                : 'border-border shadow-[0_1px_2px_hsl(214_45%_15%/0.06),0_4px_12px_-4px_hsl(214_45%_15%/0.08)] dark:border-border/80 dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05),0_1px_2px_hsl(0_0%_0%/0.4)]',
              !isActive && card.interactive && 'hover:border-foreground/20 hover:shadow-[0_1px_2px_hsl(214_45%_15%/0.08),0_10px_24px_-10px_hsl(214_45%_15%/0.18)] dark:hover:border-foreground/25'
            )}
          >
            <div
              className="pointer-events-none absolute inset-px rounded-[11px] border border-white/40 opacity-60 dark:hidden"
              aria-hidden="true"
            />
            <CardHeader className="relative flex-row items-center justify-between gap-2 space-y-0 px-3.5 pt-2.5 pb-0">
              <CardTitle className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-sidebar-foreground">
                <Icon className={cn('h-4 w-4 shrink-0', card.iconClassName)} />
                <span className="truncate">{card.title}</span>
              </CardTitle>
              {!card.procured && (
                <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                  Not procured
                </span>
              )}
            </CardHeader>
            <CardContent className="relative px-3.5 pt-1.5 pb-3">
              {updating ? (
                // An invisible copy of the loaded typography establishes the
                // exact same line box (rendered line heights differ from the
                // theoretical font-size * leading), with a skeleton overlaid,
                // so swapping states never shifts the content below.
                <div className="relative" aria-label="Loading count">
                  <span className="invisible text-2xl lg:text-[1.625rem] font-semibold leading-tight">0</span>
                  <Skeleton className="absolute inset-y-1 left-0 w-28" />
                </div>
              ) : (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <SummaryNumber
                    value={card.value}
                    compact={compact || card.value >= 1_000_000}
                    className={card.procured ? 'text-sidebar-foreground' : 'text-muted-foreground'}
                  />
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    of {formatCount(card.total, compact)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
})
