import React, { useEffect, useRef, useState } from 'react'
import { Briefcase, Building, UserCheck, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    const val = num / 1_000_000
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`
  }
  if (num >= 1_000) {
    const val = num / 1_000
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}K`
  }
  return num.toLocaleString()
}

const AnimatedNumber = React.memo(function AnimatedNumber({
  value,
  compact = false,
  className,
}: {
  value: number
  compact?: boolean
  className?: string
}): JSX.Element {
  const [displayValue, setDisplayValue] = useState(value)
  const [reduceMotion, setReduceMotion] = useState(false)
  const frameRef = useRef<number | null>(null)
  const startValueRef = useRef(value)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setReduceMotion(mediaQuery.matches)
    handleChange()
    mediaQuery.addEventListener?.('change', handleChange)
    return () => mediaQuery.removeEventListener?.('change', handleChange)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      setDisplayValue(value)
      return
    }

    startValueRef.current = displayValue
    const startTime = performance.now()
    const duration = 1100

    const step = () => {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const t = progress
      const eased = 1 - Math.pow(1 - t, 4)
      const baseValue = startValueRef.current + (value - startValueRef.current) * eased
      const overshoot = Math.sin(t * Math.PI) * (value - startValueRef.current) * 0.018
      const nextValue = baseValue + overshoot
      setDisplayValue(Math.round(nextValue))

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      }
    }

    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 text-2xl lg:text-3xl font-semibold leading-tight animate-scale-in',
        className
      )}
    >
      {compact ? formatCompactNumber(displayValue) : displayValue.toLocaleString()}
    </span>
  )
})

interface SummaryCardsProps {
  filteredAccountsCount: number
  totalAccountsCount: number
  filteredCentersCount: number
  totalCentersCount: number
  filteredProspectsCount: number
  totalProspectsCount: number
  filteredHeadcount: number
  totalHeadcount: number
  activeView: "accounts" | "centers" | "prospects"
  onSelect: (view: "accounts" | "centers" | "prospects") => void
}

export const SummaryCards = React.memo(function SummaryCards({
  filteredAccountsCount,
  totalAccountsCount,
  filteredCentersCount,
  totalCentersCount,
  filteredProspectsCount,
  totalProspectsCount,
  filteredHeadcount,
  totalHeadcount,
  activeView,
  onSelect,
}: SummaryCardsProps): JSX.Element {
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
      colorVar: '--chart-1',
      icon: Building,
      iconClassName: 'text-primary',
      clickable: true,
    },
    {
      id: 'centers' as const,
      title: 'Centers',
      value: filteredCentersCount,
      total: totalCentersCount,
      colorVar: '--chart-2',
      icon: Briefcase,
      iconClassName: 'text-[hsl(var(--chart-2))]',
      clickable: true,
    },
    {
      id: 'prospects' as const,
      title: 'Prospects',
      value: filteredProspectsCount,
      total: totalProspectsCount,
      colorVar: '--chart-3',
      icon: Users,
      iconClassName: 'text-[hsl(var(--chart-3))]',
      clickable: true,
    },
    {
      id: 'headcount' as const,
      title: 'Headcount',
      value: filteredHeadcount,
      total: totalHeadcount,
      colorVar: '--chart-4',
      icon: UserCheck,
      iconClassName: 'text-[hsl(var(--chart-4))]',
      clickable: false,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6" aria-label="Dashboard sections">
      {cards.map((card) => {
        const Icon = card.icon
        const isActive = card.clickable && activeView === card.id
        return (
          <Card
            key={card.title}
            role={card.clickable ? "button" : undefined}
            tabIndex={card.clickable ? 0 : undefined}
            aria-pressed={card.clickable ? activeView === card.id : undefined}
            onClick={card.clickable ? () => onSelect(card.id as "accounts" | "centers" | "prospects") : undefined}
            onKeyDown={card.clickable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(card.id as "accounts" | "centers" | "prospects")
              }
            } : undefined}
            className={cn(
              'relative overflow-hidden border border-border/70 bg-gradient-to-br from-card via-card to-secondary/20 shadow-[0_14px_42px_-30px_rgba(0,0,0,0.45)] transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              card.clickable && 'cursor-pointer select-none',
              isActive
                ? 'ring-2 ring-sidebar-ring border-sidebar-ring/70 shadow-[0_18px_55px_-35px_rgba(0,0,0,0.6)]'
                : card.clickable ? 'hover:-translate-y-0.5' : ''
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background: `
                  radial-gradient(circle at 18% 20%, hsl(var(${card.colorVar}) / 0.2), transparent 42%),
                  radial-gradient(circle at 82% 0%, hsl(var(${card.colorVar}) / 0.14), transparent 36%),
                  linear-gradient(125deg, hsl(var(${card.colorVar}) / 0.08), transparent 55%)
                `,
              }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-px rounded-[calc(var(--radius)-2px)] border border-white/40 dark:border-white/10 opacity-60"
              aria-hidden="true"
            />
            <CardHeader className="relative px-4 pt-3 pb-1.5">
              <CardTitle className="text-sm font-medium text-sidebar-foreground flex items-center gap-2">
                <Icon className={cn('h-4 w-4', card.iconClassName)} />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative flex flex-wrap items-end justify-between gap-2 px-4 pt-0 pb-3.5">
              <div className="min-w-0">
                <AnimatedNumber
                  value={card.value}
                  compact={compact}
                  className="text-sidebar-foreground"
                />
                <p className="mt-0.5 text-xs text-muted-foreground">Currently visible</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm whitespace-nowrap">
                {compact ? formatCompactNumber(card.total) : card.total.toLocaleString()} total
              </span>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
})
