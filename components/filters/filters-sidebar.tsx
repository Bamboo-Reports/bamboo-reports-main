"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  RiArrowDownSLine,
  RiBookmarkLine,
  RiBriefcaseLine,
  RiBuildingLine,
  RiCloseLine,
  RiDownload2Line,
  RiExpandUpDownLine,
  RiFileList3Line,
  RiFilePdf2Line,
  RiGroupLine,
  RiLoader4Line,
  RiSearchLine,
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
import { FilterSearchContext } from '@/components/filters/filter-row'
import { countActiveFields, type FilterRangeBounds, type FilterSectionId } from '@/components/filters/filter-fields'
import { ProfileMenu } from '@/components/layout/profile-menu'
import { Button } from '@/components/ui/button'
import { useCurrentProfile } from '@/hooks/use-current-profile'
import { getSectionUnavailableMessage, isSectionEnabled } from '@/lib/config/dashboard-access'
import { cn } from '@/lib/utils'
import { isFilterEnabled, isSectionVisible } from '@/lib/config/filters'
import type { AccountVisibilityMode, Alias, AvailableOptions, Filters } from '@/lib/types'

const ACCOUNT_VISIBILITY_OPTIONS: Array<{ value: AccountVisibilityMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "gcc", label: "GCCs" },
  { value: "nonGcc", label: "Non-GCCs" },
]

const DEFAULT_VISIBILITY_MODE: AccountVisibilityMode = "gcc"

const SECTIONS: Array<{ id: FilterSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "accounts", label: "Accounts", icon: RiBuildingLine },
  { id: "centers", label: "Centres", icon: RiBriefcaseLine },
  { id: "prospects", label: "Prospects", icon: RiGroupLine },
]

const EXPORT_BLOCKED_MESSAGE = "You are not allowed to export data. Please contact an admin."

interface FiltersSidebarProps {
  filters: Filters
  pendingFilters: Filters
  availableOptions: AvailableOptions
  isApplying: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
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
        "inline-grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground",
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
  isCollapsed,
  onToggleCollapse,
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
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<FilterSectionId | null>('accounts')
  const [findQuery, setFindQuery] = useState("")
  const [exportAccessError, setExportAccessError] = useState<string | null>(null)
  const [savedMenuSignal, setSavedMenuSignal] = useState(0)
  const [accountListsSignal, setAccountListsSignal] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [optimisticVisibilityMode, setOptimisticVisibilityMode] = useState(pendingFilters.accountVisibilityMode)

  const bounds: FilterRangeBounds = { revenue: revenueRange, yearsInIndia: yearsInIndiaRange, centerIncYear: centerIncYearRange }
  const visibleSections = SECTIONS.filter(({ id }) => isSectionVisible(id))
  const sectionCounts = Object.fromEntries(
    visibleSections.map(({ id }) => [id, isSectionEnabled(id) ? countActiveFields(id, pendingFilters, bounds) : 0])
  ) as Record<FilterSectionId, number>
  const visibilityCounts =
    isFilterEnabled("accountVisibilityMode") && (pendingFilters.accountVisibilityMode ?? DEFAULT_VISIBILITY_MODE) !== DEFAULT_VISIBILITY_MODE
  const totalActiveFilters = Object.values(sectionCounts).reduce((sum, n) => sum + n, 0) + (visibilityCounts ? 1 : 0)
  const searchQuery = findQuery.trim().toLowerCase()

  const checkScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
    })
  }, [])

  useEffect(() => {
    checkScroll()
  }, [openSection, searchQuery, checkScroll])

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

  // "/" jumps to "Find a filter" when focus isn't already in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || isCollapsed) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      event.preventDefault()
      findInputRef.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isCollapsed])

  const handleExport = () => {
    if (!canExport) {
      setExportAccessError(EXPORT_BLOCKED_MESSAGE)
      return
    }
    setExportAccessError(null)
    handleExportAll()
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
    if (!isSectionEnabled(id)) {
      return (
        <p className="mx-2.5 mb-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {getSectionUnavailableMessage(id)}
        </p>
      )
    }
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
      className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg pl-1 pr-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Account and settings"
      aria-label="Open profile menu"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
        {user.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[12.5px] font-semibold text-foreground">{user.displayName}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">{user.roleLabel}</span>
      </span>
      <RiExpandUpDownLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )

  const railButton = "relative grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

  return (
    <aside
      id="filters-sidebar"
      data-tour="filters-sidebar"
      className={cn(
        'bg-sidebar/90 backdrop-blur-sm overflow-hidden shrink-0 relative ml-6 mt-[var(--dashboard-content-top-gap)] mb-[var(--dashboard-content-bottom-gap)] rounded-2xl border border-sidebar-border shadow-[0_24px_60px_-45px_rgba(0,0,0,0.55)]',
        'transition-[width] duration-300 ease-[cubic-bezier(0.22_1_0.36_1)] motion-reduce:transition-none',
        isCollapsed ? 'w-16' : 'w-[320px]'
      )}
      aria-label="Filters sidebar"
    >
      {/* Collapsed rail */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-10 flex w-16 flex-col items-center gap-1 py-3 transition-all duration-200 ease-out motion-reduce:transition-none',
          isCollapsed ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-1 pointer-events-none'
        )}
        aria-hidden={!isCollapsed}
      >
        <button
          type="button"
          className={railButton}
          onClick={onToggleCollapse}
          title="Expand filters"
          aria-label="Expand filters sidebar"
          aria-expanded={false}
          aria-controls="filters-sidebar"
        >
          <RiSideBarFill className="h-[18px] w-[18px]" />
        </button>
        {totalActiveFilters > 0 ? (
          <span
            className="mb-1.5 mt-0.5 grid h-[26px] w-10 place-items-center rounded-full bg-primary/12 text-[11.5px] font-semibold tabular-nums text-primary"
            title={`${totalActiveFilters} ${totalActiveFilters === 1 ? "filter" : "filters"} applied`}
          >
            {totalActiveFilters}
          </span>
        ) : (
          <span className="h-2" />
        )}
        {visibleSections.map(({ id, label, icon: Icon }) => {
          const count = sectionCounts[id]
          return (
            <button
              key={id}
              type="button"
              className={cn(railButton, "text-primary")}
              onClick={() => expandTo(id)}
              disabled={!isSectionEnabled(id)}
              title={count ? `${label}: ${count} ${count === 1 ? "filter" : "filters"}` : label}
              aria-label={count ? `${label}, ${count} filters` : label}
            >
              <Icon className="h-[18px] w-[18px]" />
              {count > 0 && <CountBadge count={count} className="absolute -right-0.5 top-0.5 h-4 min-w-4 px-1 text-[10px] shadow-[0_0_0_2px_hsl(var(--sidebar-background))]" />}
            </button>
          )
        })}
        <span className="my-1.5 h-px w-6 bg-sidebar-border" />
        <button
          type="button"
          className={railButton}
          onClick={() => {
            expandTo()
            setSavedMenuSignal((n) => n + 1)
          }}
          title="Saved filters"
          aria-label="Saved filters"
        >
          <RiBookmarkLine className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          className={railButton}
          onClick={() => setAccountListsSignal((n) => n + 1)}
          title="Account lists"
          aria-label="Account lists"
        >
          <RiFileList3Line className="h-[18px] w-[18px]" />
        </button>
        <div className="mt-auto flex flex-col items-center gap-1">
          {handleGenerateReport && (
            <button
              type="button"
              className={railButton}
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              title="Download summary PDF"
              aria-label="Download summary report as PDF"
            >
              {isGeneratingReport ? <RiLoader4Line className="h-[18px] w-[18px] animate-spin" /> : <RiFilePdf2Line className="h-[18px] w-[18px]" />}
            </button>
          )}
          <button
            type="button"
            className={cn(railButton, "text-primary")}
            onClick={() => {
              if (!canExport) expandTo()
              handleExport()
            }}
            title={canExport ? "Export" : "Only admins can export data"}
            aria-label={canExport ? "Export data" : "Export data (admin only)"}
          >
            <RiDownload2Line className="h-[18px] w-[18px]" />
          </button>
          <ProfileMenu user={user} side="right" align="end" onStartTour={onStartTour} onOpenExports={onOpenExports} onOpenHistory={onOpenHistory}>
            <button type="button" className={railButton} title={user.displayName} aria-label="Open profile menu">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{user.initials}</span>
            </button>
          </ProfileMenu>
        </div>
      </div>

      {/* Expanded panel */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex w-[320px] flex-col transition-all duration-200 ease-out motion-reduce:transition-none',
          isCollapsed ? 'opacity-0 translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0 pointer-events-auto'
        )}
        aria-hidden={isCollapsed}
      >
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-sidebar-border px-4 pb-3 pt-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">Filters</h2>
            {totalActiveFilters > 0 && (
              <span className="inline-flex h-5 items-center rounded-full bg-primary/12 px-1.5 text-[11.5px] font-semibold tabular-nums text-primary">
                {totalActiveFilters}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setFindQuery("")
                resetFilters()
              }}
              disabled={totalActiveFilters === 0}
              className="rounded-md px-1.5 py-1 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/[0.08] disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
            >
              Clear all
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              className="text-muted-foreground"
              title="Collapse filters"
              aria-label="Collapse filters sidebar"
              aria-expanded={true}
              aria-controls="filters-sidebar"
            >
              <RiSideBarLine className="h-[18px] w-[18px]" />
            </Button>
          </div>

          <div data-tour="saved-filters">
            <SavedFiltersManager
              currentFilters={filters}
              onLoadFilters={handleLoadSavedFilters}
              totalActiveFilters={totalActiveFilters}
              openMenuSignal={savedMenuSignal}
              openAccountListsSignal={accountListsSignal}
            />
          </div>

          <label className="flex h-8 items-center gap-2 rounded-lg border border-transparent bg-muted/70 px-2.5 text-muted-foreground transition-shadow focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/15">
            <RiSearchLine className="h-3.5 w-3.5 shrink-0" />
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFindQuery("")
              }}
              placeholder="Find a filter"
              aria-label="Find a filter"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {findQuery ? (
              <button type="button" onClick={() => setFindQuery("")} className="grid h-5 w-5 place-items-center rounded hover:bg-muted" aria-label="Clear filter search">
                <RiCloseLine className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="rounded border border-border bg-background px-1 font-sans text-[10.5px] font-medium">/</kbd>
            )}
          </label>

          {isFilterEnabled("accountVisibilityMode") && (
            <div>
              <div className="mb-1 text-[11.5px] font-medium text-muted-foreground">Accounts to show</div>
              <div className="grid grid-cols-3 rounded-lg bg-muted/80 p-[3px]" role="radiogroup" aria-label="Accounts to show">
                {ACCOUNT_VISIBILITY_OPTIONS.map((option) => {
                  const isSelected = optimisticVisibilityMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setOptimisticVisibilityMode(option.value)
                        setActiveFilter("accountVisibilityMode")
                        React.startTransition(() => {
                          setPendingFilters((prev) => ({ ...prev, accountVisibilityMode: option.value }))
                        })
                      }}
                      className={cn(
                        "h-7 rounded-md text-[12.5px] font-medium transition-colors duration-150",
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
          )}
        </div>

        <FilterSearchContext.Provider value={searchQuery}>
          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable px-1.5 pb-3 pt-1.5 [&:has([data-filter-row])_[data-no-match]]:hidden"
          >
            {visibleSections.map(({ id, label, icon: Icon }) => {
              const open = searchQuery ? true : openSection === id
              const count = sectionCounts[id]
              return (
                <section
                  key={id}
                  className={cn(
                    "border-sidebar-border [&+section]:border-t",
                    searchQuery && "[&:not(:has([data-filter-row]))]:hidden",
                    !isSectionEnabled(id) && "opacity-80"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenSection(open && !searchQuery ? null : id)}
                    aria-expanded={open}
                    className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0 text-primary" />
                    {label}
                    <CountBadge count={count} />
                    <RiArrowDownSLine
                      className={cn(
                        "ml-auto h-[17px] w-[17px] shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  {open && <div className="pb-2">{renderSection(id)}</div>}
                </section>
              )
            })}
            {searchQuery && (
              <p data-no-match className="px-3 py-5 text-[12.5px] text-muted-foreground">
                No filter called &ldquo;{findQuery.trim()}&rdquo;.
              </p>
            )}
          </div>
        </FilterSearchContext.Provider>

        <div className="relative shrink-0 border-t border-sidebar-border bg-sidebar px-3 pb-3 pt-2.5">
          {/* Fade above the footer while there's more to scroll. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-sidebar to-transparent transition-opacity duration-300",
              canScrollDown ? "opacity-100" : "opacity-0"
            )}
          />
          {exportAccessError && (
            <div role="status" aria-live="polite" className="mb-2.5 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:border-amber-300/30 dark:text-amber-100">
              <RiShieldFlashLine className="mt-px h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-200" />
              <p className="min-w-0 flex-1">{exportAccessError}</p>
              <button
                type="button"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
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
              <Button
                variant="outline"
                size="icon"
                className="h-[34px] w-[34px] shrink-0"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                aria-label="Download summary report as PDF"
                title="Download a PDF with the current counts and applied filters"
                data-tour="summary-report-button"
              >
                {isGeneratingReport ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : <RiFilePdf2Line className="h-4 w-4" />}
              </Button>
            )}
            <Button
              className="h-[34px] shrink-0 gap-1.5 px-3"
              onClick={handleExport}
              aria-label={canExport ? "Export data" : "Export data (admin only)"}
              title={canExport ? "Export data" : "Only admins can export data"}
              data-tour="export-button"
            >
              <RiDownload2Line className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
