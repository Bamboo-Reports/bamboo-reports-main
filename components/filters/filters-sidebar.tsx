"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RiArrowDownSLine,
  RiBookmarkLine,
  RiBriefcaseLine,
  RiBuildingLine,
  RiCloseLine,
  RiDownload2Line,
  RiFileList3Line,
  RiFilePdf2Line,
  RiGroupLine,
  RiLoader4Line,
  RiShieldFlashLine,
  RiSideBarFill,
  RiSideBarLine,
} from "@remixicon/react"
import { SavedFiltersManager } from '@/components/saved-filters-manager'
import {
  AccountFiltersSection,
  CenterFiltersSection,
  ProspectFiltersSection,
} from '@/components/filters/filter-sections'
import { countActiveFields, countActiveFilters, type FilterRangeBounds, type FilterSectionId } from '@/lib/dashboard/active-filters'
import { describeFilters } from '@/components/filters/filter-description'
import { onSegmentKeyDown } from '@/components/filters/segment-keys'
import { ProfileMenu } from '@/components/layout/profile-menu'
import { useAccountLists } from '@/contexts/account-lists-context'
import { Button } from '@/components/ui/button'
import { HintTooltip, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentProfile } from '@/hooks/use-current-profile'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'
import { cn } from '@/lib/utils'
import type { AccountVisibilityMode, Alias, AvailableOptions, Filters } from '@/lib/types'

const ACCOUNT_VISIBILITY_OPTIONS: Array<{ value: AccountVisibilityMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "gcc", label: "GCCs" },
  { value: "nonGcc", label: "Non-GCCs" },
]

const VISIBILITY_VALUES = ACCOUNT_VISIBILITY_OPTIONS.map((option) => option.value)

const SECTIONS: Array<{ id: FilterSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "accounts", label: "Accounts", icon: RiBuildingLine },
  { id: "centers", label: "Centres", icon: RiBriefcaseLine },
  { id: "prospects", label: "Prospects", icon: RiGroupLine },
]

const EXPORT_BLOCKED_MESSAGE = "You are not allowed to export data. Please contact an admin."
const EXPORT_ADMIN_ONLY_HINT = "Only admins can export data"

function filtersAppliedLabel(count: number) {
  return `${count} ${count === 1 ? "filter" : "filters"} applied`
}

interface FiltersSidebarProps {
  filters: Filters
  pendingFilters: Filters
  availableOptions: AvailableOptions
  isApplying: boolean
  revenueRange: { min: number; max: number }
  yearsInIndiaRange: { min: number; max: number }
  centerIncYearRange: { min: number; max: number }
  accountNames: string[]
  aliases?: Alias[]
  serverMode?: boolean

  setPendingFilters: React.Dispatch<React.SetStateAction<Filters>>
  resetFilters: () => void
  handleExportAll: () => void
  canExport: boolean
  handleGenerateReport?: () => void
  isGeneratingReport?: boolean
  handleRevenueRangeChange: (value: [number, number]) => void
  handleYearsInIndiaRangeChange: (value: [number, number]) => void
  handleCenterIncYearRangeChange: (value: [number, number]) => void

  handleLoadSavedFilters: (savedFilters: Filters) => void
  onStartTour?: () => void
  onOpenExports?: () => void
  onOpenHistory?: () => void
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null
  return (
    <span
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-md bg-primary/10 px-1.5 text-xs font-medium tabular-nums text-primary-strong",
        className
      )}
    >
      {count}
    </span>
  )
}

export function FiltersSidebar({
  filters,
  pendingFilters,
  availableOptions,
  isApplying,
  revenueRange,
  yearsInIndiaRange,
  centerIncYearRange,
  accountNames,
  aliases,
  serverMode,
  setPendingFilters,
  resetFilters,
  handleExportAll,
  canExport,
  handleGenerateReport,
  isGeneratingReport,
  handleRevenueRangeChange,
  handleYearsInIndiaRangeChange,
  handleCenterIncYearRangeChange,
  handleLoadSavedFilters,
  onStartTour,
  onOpenExports,
  onOpenHistory,
}: FiltersSidebarProps): React.JSX.Element {
  const user = useCurrentProfile()
  const { isSidebarCollapsed: isCollapsed, toggleSidebar: onToggleCollapse } = useSidebarCollapsed()
  const { lists: accountLists } = useAccountLists()
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<FilterSectionId | null>('accounts')
  const [exportAccessError, setExportAccessError] = useState<string | null>(null)
  const [savedMenuSignal, setSavedMenuSignal] = useState(0)
  const [accountListsSignal, setAccountListsSignal] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [optimisticVisibilityMode, setOptimisticVisibilityMode] = useState(pendingFilters.accountVisibilityMode)

  // Memoised, with the two callbacks below, so SavedFiltersManager (memo) is
  // left alone while a filter is being typed.
  const bounds = useMemo<FilterRangeBounds>(
    () => ({ revenue: revenueRange, yearsInIndia: yearsInIndiaRange, centerIncYear: centerIncYearRange }),
    [revenueRange, yearsInIndiaRange, centerIncYearRange]
  )
  const listNames = useMemo(() => new Map(accountLists.map((list) => [list.id, list.name])), [accountLists])
  const sectionCounts = useMemo(
    () =>
      Object.fromEntries(SECTIONS.map(({ id }) => [id, countActiveFields(id, pendingFilters, bounds)])) as Record<
        FilterSectionId,
        number
      >,
    [pendingFilters, bounds]
  )
  const totalActiveFilters = countActiveFilters(pendingFilters, bounds)
  const countSavedFilters = useCallback((saved: Partial<Filters>) => countActiveFilters(saved, bounds), [bounds])
  const describeSavedFilters = useCallback(
    (saved: Partial<Filters>) => describeFilters(saved, bounds, listNames),
    [bounds, listNames]
  )

  const checkScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
    })
  }, [])

  useEffect(() => {
    checkScroll()
  }, [openSection, checkScroll])

  useEffect(() => {
    setOptimisticVisibilityMode(pendingFilters.accountVisibilityMode)
  }, [pendingFilters.accountVisibilityMode])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll, { passive: true })
    const observer = new MutationObserver(checkScroll)
    observer.observe(el, { childList: true, subtree: true, attributes: true })
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(el)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [checkScroll])

  useEffect(() => {
    if (canExport && exportAccessError) setExportAccessError(null)
  }, [canExport, exportAccessError])

  const handleExport = () => {
    if (!canExport) {
      setExportAccessError(EXPORT_BLOCKED_MESSAGE)
      return
    }
    setExportAccessError(null)
    handleExportAll()
  }

  const selectVisibility = (value: AccountVisibilityMode) => {
    setOptimisticVisibilityMode(value)
    setActiveFilter("accountVisibilityMode")
    React.startTransition(() => {
      setPendingFilters((prev) => ({ ...prev, accountVisibilityMode: value }))
    })
  }

  const expandTo = (section?: FilterSectionId) => {
    if (section) setOpenSection(section)
    if (isCollapsed) onToggleCollapse()
  }

  const sectionProps = {
    pendingFilters,
    availableOptions,
    isApplying,
    activeFilter,
    setPendingFilters,
    setActiveFilter,
  }

  const renderSection = (id: FilterSectionId) => {
    if (id === "accounts") {
      return (
        <AccountFiltersSection
          {...sectionProps}
          accountNames={accountNames}
          aliases={aliases}
          serverMode={serverMode}
          revenueRange={revenueRange}
          yearsInIndiaRange={yearsInIndiaRange}
          handleRevenueRangeChange={handleRevenueRangeChange}
          handleYearsInIndiaRangeChange={handleYearsInIndiaRangeChange}
        />
      )
    }
    if (id === "centers") {
      return (
        <CenterFiltersSection
          {...sectionProps}
          centerIncYearRange={centerIncYearRange}
          handleCenterIncYearRangeChange={handleCenterIncYearRangeChange}
        />
      )
    }
    return <ProspectFiltersSection {...sectionProps} />
  }

  const profileTrigger = (
    <button
      type="button"
      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Open profile menu"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
        {user.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium text-foreground">{user.displayName}</span>
        <span className="truncate text-xs text-muted-foreground">{user.roleLabel}</span>
      </span>
    </button>
  )

  const railButton = "relative grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

  return (
    <aside
      id="filters-sidebar"
      data-tour="filters-sidebar"
      className={cn(
        'bg-sidebar overflow-hidden shrink-0 relative ml-6 mt-[var(--dashboard-content-top-gap)] mb-[var(--dashboard-content-bottom-gap)] rounded-2xl border border-sidebar-border',
        // No width transition: animating it relaid out the dashboard every frame.
        // The rail and the panel below crossfade instead.
        isCollapsed ? 'w-16' : 'w-[320px]'
      )}
      aria-label="Filters sidebar"
    >
      {/* Collapsed rail */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-10 flex w-16 flex-col items-center gap-1 py-3 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          isCollapsed ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-1 pointer-events-none'
        )}
        // inert, not just aria-hidden: the hidden panel's buttons must leave the tab order too.
        inert={!isCollapsed}
      >
        <HintTooltip label="Expand filters" side="right">
          <button
            type="button"
            className={railButton}
            onClick={onToggleCollapse}
            aria-expanded={false}
            aria-controls="filters-sidebar"
          >
            <RiSideBarFill className="h-[18px] w-[18px]" />
          </button>
        </HintTooltip>
        {totalActiveFilters > 0 ? (
          <HintTooltip label={filtersAppliedLabel(totalActiveFilters)} side="right">
            <span
              role="img"
              tabIndex={0}
              className="my-1 grid h-6 w-10 place-items-center rounded-md bg-primary/10 text-xs font-medium tabular-nums text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {totalActiveFilters}
            </span>
          </HintTooltip>
        ) : (
          <span className="h-2" />
        )}
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const count = sectionCounts[id]
          return (
            <HintTooltip key={id} label={label} hint={count ? filtersAppliedLabel(count) : undefined} side="right">
              <button
                type="button"
                className={railButton}
                onClick={() => expandTo(id)}
              >
                <Icon className="h-[18px] w-[18px]" />
                {count > 0 && <CountBadge count={count} className="absolute -right-0.5 top-0.5 h-4 min-w-4 rounded-full bg-primary px-1 text-[10px] text-primary-foreground shadow-[0_0_0_2px_hsl(var(--sidebar-background))]" />}
              </button>
            </HintTooltip>
          )
        })}
        <span className="my-2 h-px w-6 bg-sidebar-border" />
        <HintTooltip label="Saved filters" side="right">
          <button
            type="button"
            className={railButton}
            onClick={() => {
              expandTo()
              setSavedMenuSignal((n) => n + 1)
            }}
          >
            <RiBookmarkLine className="h-[18px] w-[18px]" />
          </button>
        </HintTooltip>
        <HintTooltip label="Account lists" side="right">
          <button
            type="button"
            className={railButton}
            onClick={() => setAccountListsSignal((n) => n + 1)}
          >
            <RiFileList3Line className="h-[18px] w-[18px]" />
          </button>
        </HintTooltip>
        <div className="mt-auto flex flex-col items-center gap-1">
          {handleGenerateReport && (
            <HintTooltip label="Download summary PDF" side="right">
              <button
                type="button"
                className={railButton}
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
              >
                {isGeneratingReport ? <RiLoader4Line className="h-[18px] w-[18px] animate-spin" /> : <RiFilePdf2Line className="h-[18px] w-[18px]" />}
              </button>
            </HintTooltip>
          )}
          <HintTooltip label="Export data" hint={canExport ? undefined : EXPORT_ADMIN_ONLY_HINT} side="right">
            <button
              type="button"
              className={cn(railButton, "aria-disabled:opacity-50")}
              aria-disabled={canExport ? undefined : true}
              onClick={() => {
                // Not allowed: no export, just the reason in the expanded panel's footer.
                if (!canExport) expandTo()
                handleExport()
              }}
            >
              <RiDownload2Line className="h-[18px] w-[18px]" />
            </button>
          </HintTooltip>
          {/* Tooltip wraps the menu so its trigger and the menu's trigger are the same button. */}
          <Tooltip>
            <ProfileMenu user={user} side="right" align="end" onStartTour={onStartTour} onOpenExports={onOpenExports} onOpenHistory={onOpenHistory}>
              <TooltipTrigger asChild>
                <button type="button" className={railButton} aria-label={user.displayName}>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{user.initials}</span>
                </button>
              </TooltipTrigger>
            </ProfileMenu>
            <TooltipContent side="right" aria-label="Account and settings">
              {user.displayName}
              <span className="br-tip-hint">Account and settings</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Expanded panel */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex w-[320px] flex-col transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          isCollapsed ? 'opacity-0 translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0 pointer-events-auto'
        )}
        inert={isCollapsed}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-sidebar-border p-4 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium text-foreground">Filters</h2>
            {totalActiveFilters > 0 && (
              <span className="inline-flex h-5 items-center rounded-md bg-primary/10 px-1.5 text-xs font-medium tabular-nums text-primary-strong">
                {totalActiveFilters}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={resetFilters}
              disabled={totalActiveFilters === 0}
              className="rounded-md px-2 py-1 text-[13px] font-medium text-primary transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
            >
              Clear all
            </button>
            <HintTooltip label="Collapse filters">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                className="text-muted-foreground"
                aria-expanded={true}
                aria-controls="filters-sidebar"
              >
                <RiSideBarLine className="h-[18px] w-[18px]" />
              </Button>
            </HintTooltip>
          </div>

          <div data-tour="saved-filters">
            <SavedFiltersManager
              currentFilters={filters}
              onLoadFilters={handleLoadSavedFilters}
              totalActiveFilters={totalActiveFilters}
              openMenuSignal={savedMenuSignal}
              openAccountListsSignal={accountListsSignal}
              countFilters={countSavedFilters}
              describeFilters={describeSavedFilters}
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Accounts to show</div>
            <div className="grid grid-cols-3 rounded-lg bg-muted/80 p-0.5" role="radiogroup" aria-label="Accounts to show">
              {ACCOUNT_VISIBILITY_OPTIONS.map((option) => {
                const isSelected = optimisticVisibilityMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => selectVisibility(option.value)}
                    onKeyDown={(event) =>
                      onSegmentKeyDown(event, VISIBILITY_VALUES, optimisticVisibilityMode, selectVisibility)
                    }
                    className={cn(
                      "h-7 rounded-md text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--border)/0.6)]"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable px-2 pb-3 pt-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const open = openSection === id
            const count = sectionCounts[id]
            return (
              <section
                key={id}
                className="border-sidebar-border [&+section]:border-t"
              >
                <button
                  type="button"
                  onClick={() => setOpenSection(open ? null : id)}
                  aria-expanded={open}
                  className="flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {label}
                  <CountBadge count={count} />
                  <RiArrowDownSLine
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
                      open && "rotate-180"
                    )}
                  />
                </button>
                {open && <div className="pb-2">{renderSection(id)}</div>}
              </section>
            )
          })}
        </div>

        <div className="relative shrink-0 border-t border-sidebar-border bg-sidebar p-3">
          {/* Fade above the footer while there's more to scroll. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-sidebar to-transparent transition-opacity duration-200 ease-out",
              canScrollDown ? "opacity-100" : "opacity-0"
            )}
          />
          {exportAccessError && (
            <div role="status" aria-live="polite" className="mb-2.5 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:border-amber-300/30 dark:text-amber-100">
              <RiShieldFlashLine className="mt-px h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-200" />
              <p className="min-w-0 flex-1">{exportAccessError}</p>
              <button
                type="button"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-amber-800 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-200"
                onClick={() => setExportAccessError(null)}
                aria-label="Dismiss export access warning"
              >
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <ProfileMenu user={user} side="top" align="start" onStartTour={onStartTour} onOpenExports={onOpenExports} onOpenHistory={onOpenHistory}>
              {profileTrigger}
            </ProfileMenu>
            {handleGenerateReport && (
              <HintTooltip label="Download summary PDF" hint="The current counts and applied filters">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  data-tour="summary-report-button"
                >
                  {isGeneratingReport ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiFilePdf2Line className="h-4 w-4" />}
                </Button>
              </HintTooltip>
            )}
            {canExport ? (
              <Button
                className="h-9 shrink-0 gap-2 px-3"
                onClick={handleExport}
                data-tour="export-button"
              >
                <RiDownload2Line className="h-4 w-4" />
                Export
              </Button>
            ) : (
              <HintTooltip label="Export data" hint={EXPORT_ADMIN_ONLY_HINT}>
                {/* aria-disabled, not disabled, so it keeps focus and shows why. A click shows the reason above. */}
                <Button
                  className="h-9 shrink-0 gap-2 px-3 opacity-50"
                  aria-disabled="true"
                  onClick={handleExport}
                  data-tour="export-button"
                >
                  <RiDownload2Line className="h-4 w-4" />
                  Export
                </Button>
              </HintTooltip>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
