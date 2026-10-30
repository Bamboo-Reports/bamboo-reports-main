import React, { useLayoutEffect, useRef, useState } from 'react'
import { RiBriefcaseLine, RiBuildingLine, RiGroupLine, RiTimeLine, RiUserFollowLine } from "@remixicon/react"
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getSectionUnavailableMessage, isSectionEnabled } from '@/lib/config/dashboard-access'
import { useNumberFormatPreference } from '@/hooks/use-number-format-preference'
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

const NUMBER_CLASS = 'text-2xl font-semibold leading-tight tracking-tight tabular-nums'
const TOTAL_CLASS = 'text-xs tabular-nums'

/**
 * How much of a card's figure line is shortened:
 * 0 = both full, 1 = total compact, 2 = number and total compact.
 */
type CompactLevel = 0 | 1 | 2

/**
 * Picks the least compact format whose figure line fits the card, measured
 * per card so roomy cards keep exact numbers while narrow ones shorten.
 * Hidden copies of each format are measured rather than the visible line,
 * so the choice never feeds back into the width being measured.
 */
function useCompactLevel(value: number, total: number) {
  const rowRef = useRef<HTMLDivElement>(null)
  const fullRef = useRef<HTMLDivElement>(null)
  const totalCompactRef = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState<CompactLevel>(0)

  useLayoutEffect(() => {
    const row = rowRef.current
    const full = fullRef.current
    const totalCompact = totalCompactRef.current
    if (!row || !full || !totalCompact) return
    const check = () => {
      const available = row.clientWidth
      if (full.getBoundingClientRect().width <= available) setLevel(0)
      else if (totalCompact.getBoundingClientRect().width <= available) setLevel(1)
      else setLevel(2)
    }
    check()
    // The row is observed for sidebar, window, and zoom changes. A web font
    // swap widens the text without resizing anything observable, so font
    // loads trigger their own check.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    observer?.observe(row)
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    let active = true
    fonts?.ready.then(() => { if (active) check() })
    fonts?.addEventListener('loadingdone', check)
    return () => {
      active = false
      observer?.disconnect()
      fonts?.removeEventListener('loadingdone', check)
    }
  }, [value, total])

  return { level, rowRef, fullRef, totalCompactRef }
}

const SummaryFigure = React.memo(function SummaryFigure({
  value,
  total,
  procured,
  updating,
}: {
  value: number
  total: number
  procured: boolean
  updating: boolean
}): React.JSX.Element {
  const [preference] = useNumberFormatPreference()
  const { level: fitLevel, rowRef, fullRef, totalCompactRef } = useCompactLevel(value, total)
  // The user's preference wins; "auto" uses whatever fits the card.
  const level: CompactLevel = preference === 'full' ? 0 : preference === 'short' ? 2 : fitLevel
  const fullValue = value.toLocaleString()
  const fullTotal = total.toLocaleString()
  const shownValue = level === 2 ? formatCompactNumber(value) : fullValue
  const shownTotal = level >= 1 ? formatCompactNumber(total) : fullTotal

  // Measure copies render their text through CSS content, so it never shows up
  // in find-in-page, copied text, or text queries.
  const measureClass = 'flex w-max items-baseline gap-1.5 whitespace-nowrap'
  const measureText = 'before:content-[attr(data-text)]'

  return (
    <div ref={rowRef} className="relative mt-1 flex min-w-0 items-baseline gap-1.5">
      {/* Zero-size clip box, so the full-width copies never cause overflow. */}
      <div className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        <div ref={fullRef} className={measureClass}>
          <span className={cn(NUMBER_CLASS, measureText)} data-text={fullValue} />
          <span className={cn(TOTAL_CLASS, measureText)} data-text={`of ${fullTotal}`} />
        </div>
        <div ref={totalCompactRef} className={measureClass}>
          <span className={cn(NUMBER_CLASS, measureText)} data-text={fullValue} />
          <span className={cn(TOTAL_CLASS, measureText)} data-text={`of ${formatCompactNumber(total)}`} />
        </div>
      </div>
      {updating ? (
        // An invisible copy of the loaded number establishes the exact
        // same line box, with a skeleton overlaid, so swapping states
        // never shifts the content below.
        <span className="relative shrink-0" aria-label="Loading count">
          <span className={cn('invisible', NUMBER_CLASS)}>0</span>
          <Skeleton className="absolute inset-y-1 left-0 w-16" />
          <span className="invisible inline-block w-16" />
        </span>
      ) : (
        <span
          className={cn('shrink-0', NUMBER_CLASS, procured ? 'text-sidebar-foreground' : 'text-muted-foreground')}
          title={shownValue === fullValue ? undefined : fullValue}
        >
          {shownValue}
        </span>
      )}
      <span
        className={cn('min-w-0 truncate text-muted-foreground', TOTAL_CLASS)}
        title={shownTotal === fullTotal && preference !== 'full' ? undefined : `of ${fullTotal}`}
      >
        of {shownTotal}
      </span>
    </div>
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
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6" aria-label="Dashboard sections" data-tour="summary-cards">
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
              'px-3.5 pt-2.5 pb-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 ease-out animate-stagger',
              card.interactive && 'cursor-pointer select-none',
              !card.interactive && card.message && 'cursor-help',
              isActive
                ? 'ring-2 ring-sidebar-ring border-transparent shadow-[0_18px_55px_-35px_rgba(0,0,0,0.6)]'
                : 'border-border/70 shadow-[0_14px_42px_-30px_rgba(0,0,0,0.45)]',
              !isActive && card.interactive && 'hover:border-border hover:shadow-[0_16px_48px_-32px_rgba(0,0,0,0.5)]'
            )}
          >
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-sidebar-foreground">
              <Icon className={cn('h-4 w-4 shrink-0', card.iconClassName)} />
              <span className={cn('truncate', !card.procured && 'text-muted-foreground')}>{card.title}</span>
              {!card.procured && (
                <span className="ml-auto inline-flex h-[18px] shrink-0 items-center rounded-full bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground">
                  Not procured
                </span>
              )}
            </div>
            <SummaryFigure
              value={card.value}
              total={card.total}
              procured={card.procured}
              updating={updating}
            />
          </Card>
        )
      })}
    </div>
  )
})
