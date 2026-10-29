"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RiArrowDownSLine, RiArrowLeftSLine, RiArrowRightSLine, RiBriefcaseLine, RiBuildingLine, RiFilterLine, RiGroupLine } from "@remixicon/react"
import { SavedFiltersManager } from '@/components/saved-filters-manager'
import {
  AccountFiltersSection,
  CenterFiltersSection,
  ProspectFiltersSection,
} from '@/components/filters/filter-sections'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { getSectionUnavailableMessage, isSectionEnabled } from '@/lib/config/dashboard-access'
import { cn } from '@/lib/utils'
import { isFilterEnabled, isSectionVisible } from '@/lib/config/filters'
import type { AccountVisibilityMode, Alias, AvailableOptions, Filters } from '@/lib/types'

const ACCOUNT_VISIBILITY_OPTIONS: Array<{ value: AccountVisibilityMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "gcc", label: "GCCs" },
  { value: "nonGcc", label: "NON-GCCs" },
]

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
  handleMinRevenueChange: (value: string) => void
  handleMaxRevenueChange: (value: string) => void
  handleRevenueRangeChange: (value: [number, number]) => void
  handleMinYearsInIndiaChange: (value: string) => void
  handleMaxYearsInIndiaChange: (value: string) => void
  handleYearsInIndiaRangeChange: (value: [number, number]) => void
  handleMinCenterIncYearChange: (value: string) => void
  handleMaxCenterIncYearChange: (value: string) => void
  handleCenterIncYearRangeChange: (value: [number, number]) => void

  getTotalActiveFilters: () => number
  handleLoadSavedFilters: (savedFilters: Filters) => void
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
  handleMinRevenueChange,
  handleMaxRevenueChange,
  handleRevenueRangeChange,
  handleMinYearsInIndiaChange,
  handleMaxYearsInIndiaChange,
  handleYearsInIndiaRangeChange,
  handleMinCenterIncYearChange,
  handleMaxCenterIncYearChange,
  handleCenterIncYearRangeChange,
  getTotalActiveFilters,
  handleLoadSavedFilters,
}: FiltersSidebarProps): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<string>('accounts')
  const totalActiveFilters = getTotalActiveFilters()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [optimisticVisibilityMode, setOptimisticVisibilityMode] = useState(pendingFilters.accountVisibilityMode)
  const visibilityModeIndex = ACCOUNT_VISIBILITY_OPTIONS.findIndex(
    (option) => option.value === optimisticVisibilityMode
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

  const handleCollapsedIconClick = (section: string) => {
    setOpenSection(section)
    if (isCollapsed) {
      onToggleCollapse()
    }
  }

  return (
    <>
    {/* Below md the rail would take a third of the screen, so the sidebar
        opens as a sheet over the content and collapses to a floating button. */}
    {isCollapsed ? (
      <Button
        onClick={onToggleCollapse}
        aria-label="Open filters"
        aria-expanded={false}
        aria-controls="filters-sidebar"
        className="fixed bottom-4 left-4 z-40 h-10 rounded-full px-4 shadow-[0_1px_2px_hsl(214_45%_15%/0.1),0_8px_24px_-6px_hsl(214_45%_15%/0.35)] md:hidden"
      >
        <RiFilterLine />
        Filters
        {totalActiveFilters > 0 ? (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-[11px] font-semibold">
            {totalActiveFilters}
          </span>
        ) : null}
      </Button>
    ) : (
      <div
        className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px] md:hidden"
        onClick={onToggleCollapse}
        aria-hidden="true"
      />
    )}
    <aside
      id="filters-sidebar"
      data-tour="filters-sidebar"
      className={cn(
        'bg-sidebar/90 backdrop-blur-sm overflow-hidden shrink-0 relative ml-6 mt-[var(--dashboard-content-top-gap)] mb-[var(--dashboard-content-bottom-gap)] rounded-xl border border-sidebar-border shadow-[0_1px_2px_hsl(214_45%_15%/0.06),0_4px_12px_-4px_hsl(214_45%_15%/0.08)] dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05),0_1px_2px_hsl(0_0%_0%/0.4)]',
        'transition-[width] duration-300 ease-[cubic-bezier(0.22_1_0.36_1)] motion-reduce:transition-none',
        isCollapsed ? 'w-16 max-md:hidden' : 'w-[320px] max-md:fixed max-md:inset-y-3 max-md:left-3 max-md:z-50 max-md:m-0 max-md:w-[min(320px,calc(100vw-1.5rem))] max-md:bg-sidebar max-md:shadow-2xl'
      )}
      aria-label="Filters sidebar"
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-10 w-16 px-2 py-4 transition-all duration-200 ease-out motion-reduce:transition-none',
          isCollapsed ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-1 pointer-events-none'
        )}
      >
        <div className="flex h-full flex-col items-center gap-2">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onToggleCollapse}
            title="Expand filters sidebar"
            aria-label="Expand filters sidebar"
            aria-expanded={false}
            aria-controls="filters-sidebar"
          >
            <RiArrowRightSLine className="h-4 w-4" />
          </Button>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md border border-sidebar-border bg-background/70 text-primary"
            title="FILTERS"
          >
            <RiFilterLine className="h-4 w-4" />
          </div>
          {[
            { icon: RiBuildingLine, label: 'Account Attributes', section: 'accounts', iconClass: 'text-primary' },
            { icon: RiBriefcaseLine, label: 'Centre Attributes', section: 'centers', iconClass: 'text-primary' },
            { icon: RiGroupLine, label: 'Prospect Attributes', section: 'prospects', iconClass: 'text-primary' },
          ].filter(({ section }) => isSectionVisible(section)).map(({ icon: Icon, label, section, iconClass }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon-lg"
              onClick={() => handleCollapsedIconClick(section)}
              disabled={!isSectionEnabled(section as "accounts" | "centers" | "prospects")}
              className={iconClass}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <div className="mt-auto flex h-10 min-w-10 items-center justify-center rounded-md border border-sidebar-border bg-background/70 px-2 text-[11px] font-semibold text-foreground">
            {totalActiveFilters}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'absolute inset-y-0 left-0 w-[320px] overflow-y-auto scrollbar-gutter-stable p-4 space-y-3 transition-all duration-200 ease-out motion-reduce:transition-none',
          isCollapsed ? 'opacity-0 translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0 pointer-events-auto'
        )}
      >
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                <RiFilterLine className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold tracking-normal text-foreground">FILTERS</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="shrink-0"
              title="Collapse filters sidebar"
              aria-label="Collapse filters sidebar"
              aria-expanded={true}
              aria-controls="filters-sidebar"
            >
              <RiArrowLeftSLine className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-2" data-tour="saved-filters">
            <SavedFiltersManager
              currentFilters={filters}
              onLoadFilters={handleLoadSavedFilters}
              totalActiveFilters={totalActiveFilters}
              onReset={resetFilters}
              onExport={handleExportAll}
              canExport={canExport}
              exportBlockedMessage="You are not allowed to export data. Please contact an admin."
              onGenerateReport={handleGenerateReport}
              isGeneratingReport={isGeneratingReport}
            />
          </div>
        </div>

        {isFilterEnabled("accountVisibilityMode") && (
          <div className="relative grid h-9 grid-cols-3 border-b border-border" role="group" aria-label="Account Visibility">
            <span
              aria-hidden="true"
              className="absolute -bottom-px left-0 h-0.5 w-1/3 rounded-t-sm bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(${Math.max(visibilityModeIndex, 0) * 100}%)` }}
            />
            {ACCOUNT_VISIBILITY_OPTIONS.map((option) => {
              const isSelected = optimisticVisibilityMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setOptimisticVisibilityMode(option.value)
                    setActiveFilter("accountVisibilityMode")
                    React.startTransition(() => {
                      setPendingFilters((prev) => ({ ...prev, accountVisibilityMode: option.value }))
                    })
                  }}
                  className={cn(
                    "relative z-10 inline-flex h-full items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium leading-none transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isSelected
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}

        <Accordion type="single" collapsible value={openSection} onValueChange={setOpenSection} className="w-full space-y-2">
          {isSectionVisible("accounts") && (
          <AccordionItem value="accounts" className={cn("overflow-hidden rounded-lg border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm", !isSectionEnabled("accounts") && "opacity-80")}>
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <RiBuildingLine className="h-4 w-4 text-primary" />
                </div>
                <span className="uppercase tracking-wider text-[12px]">Account Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              {isSectionEnabled("accounts") ? (
              <AccountFiltersSection
                pendingFilters={pendingFilters}
                availableOptions={availableOptions}
                isApplying={isApplying}
                activeFilter={activeFilter}
                setPendingFilters={setPendingFilters}
                setActiveFilter={setActiveFilter}
                accountNames={accountNames}
                aliases={aliases}
                serverMode={serverMode}
                revenueRange={revenueRange}
                yearsInIndiaRange={yearsInIndiaRange}
                handleMinRevenueChange={handleMinRevenueChange}
                handleMaxRevenueChange={handleMaxRevenueChange}
                handleRevenueRangeChange={handleRevenueRangeChange}
                handleMinYearsInIndiaChange={handleMinYearsInIndiaChange}
                handleMaxYearsInIndiaChange={handleMaxYearsInIndiaChange}
                handleYearsInIndiaRangeChange={handleYearsInIndiaRangeChange}
              />
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {getSectionUnavailableMessage("accounts")}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
          )}

          {isSectionVisible("centers") && (
          <AccordionItem value="centers" className={cn("overflow-hidden rounded-lg border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm", !isSectionEnabled("centers") && "opacity-80")}>
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <RiBriefcaseLine className="h-4 w-4 text-primary" />
                </div>
                <span className="uppercase tracking-wider text-[12px]">Centre Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              {isSectionEnabled("centers") ? (
              <CenterFiltersSection
                pendingFilters={pendingFilters}
                availableOptions={availableOptions}
                isApplying={isApplying}
                activeFilter={activeFilter}
                setPendingFilters={setPendingFilters}
                setActiveFilter={setActiveFilter}
                centerIncYearRange={centerIncYearRange}
                handleMinCenterIncYearChange={handleMinCenterIncYearChange}
                handleMaxCenterIncYearChange={handleMaxCenterIncYearChange}
                handleCenterIncYearRangeChange={handleCenterIncYearRangeChange}
              />
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {getSectionUnavailableMessage("centers")}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
          )}

          {isSectionVisible("prospects") && (
          <AccordionItem value="prospects" className={cn("overflow-hidden rounded-lg border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm", !isSectionEnabled("prospects") && "opacity-80")}>
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <RiGroupLine className="h-4 w-4 text-primary" />
                </div>
                <span className="uppercase tracking-wider text-[12px]">Prospect Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              {isSectionEnabled("prospects") ? (
              <ProspectFiltersSection
                pendingFilters={pendingFilters}
                availableOptions={availableOptions}
                isApplying={isApplying}
                activeFilter={activeFilter}
                setPendingFilters={setPendingFilters}
                setActiveFilter={setActiveFilter}
              />
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {getSectionUnavailableMessage("prospects")}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
          )}
        </Accordion>
      </div>

      {/* Scroll down indicator */}
      <div
        className={cn(
          'absolute bottom-0 left-0 w-[320px] flex justify-center pointer-events-none transition-opacity duration-300',
          canScrollDown && !isCollapsed ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="bg-gradient-to-t from-sidebar/90 to-transparent w-full pt-6 pb-3 flex justify-center">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/80 border border-border/70">
            <RiArrowDownSLine className="h-3.5 w-3.5 text-muted-foreground shrink-0 translate-y-[0.5px]" />
          </div>
        </div>
      </div>
    </aside>
    </>
  )
}
