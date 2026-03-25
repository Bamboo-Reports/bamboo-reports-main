"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Briefcase, Building, ChevronDown, ChevronLeft, ChevronRight, Filter, Users } from 'lucide-react'
import { SavedFiltersManager } from '@/components/saved-filters-manager'
import {
  AccountFiltersSection,
  CenterFiltersSection,
  ProspectFiltersSection,
} from '@/components/filters/filter-sections'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isSectionVisible } from '@/lib/config/filters'
import type { AvailableOptions, Filters } from '@/lib/types'

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

  setPendingFilters: React.Dispatch<React.SetStateAction<Filters>>
  resetFilters: () => void
  handleExportAll: () => void
  canExport: boolean
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
  formatRevenueInMillions: (value: number) => string
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
  setPendingFilters,
  resetFilters,
  handleExportAll,
  canExport,
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
  formatRevenueInMillions,
}: FiltersSidebarProps): JSX.Element {
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<string[]>(['accounts'])
  const totalActiveFilters = getTotalActiveFilters()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const checkScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
    })
  }, [])

  useEffect(() => {
    checkScroll()
  }, [openSections, checkScroll])

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
    setOpenSections([section])
    if (isCollapsed) {
      onToggleCollapse()
    }
  }

  return (
    <aside
      id="filters-sidebar"
      className={cn(
        'bg-sidebar/90 backdrop-blur-sm overflow-hidden shrink-0 relative ml-6 mt-[var(--dashboard-content-top-gap)] mb-[var(--dashboard-content-bottom-gap)] rounded-2xl border border-sidebar-border shadow-[0_24px_60px_-45px_rgba(0,0,0,0.55)]',
        'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        isCollapsed ? 'w-16' : 'w-[320px]'
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
            size="icon"
            onClick={onToggleCollapse}
            className="h-10 w-10"
            title="Expand filters sidebar"
            aria-label="Expand filters sidebar"
            aria-expanded={false}
            aria-controls="filters-sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-background/70 text-primary"
            title="FILTERS"
          >
            <Filter className="h-4 w-4" />
          </div>
          {[
            { icon: Building, label: 'Account Attributes', section: 'accounts', iconClass: 'text-primary' },
            { icon: Briefcase, label: 'Center Attributes', section: 'centers', iconClass: 'text-[hsl(var(--chart-2))]' },
            { icon: Users, label: 'Prospect Attributes', section: 'prospects', iconClass: 'text-[hsl(var(--chart-3))]' },
          ].filter(({ section }) => isSectionVisible(section)).map(({ icon: Icon, label, section, iconClass }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon"
              onClick={() => handleCollapsedIconClick(section)}
              className={cn(
                'h-10 w-10 rounded-xl border border-transparent bg-secondary/20 transition-colors hover:bg-secondary/30',
                iconClass
              )}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <div className="mt-auto flex h-10 min-w-10 items-center justify-center rounded-xl border border-sidebar-border bg-background/70 px-2 text-[11px] font-semibold text-foreground">
            {totalActiveFilters}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'absolute inset-y-0 left-0 w-[320px] overflow-y-auto p-4 space-y-3 transition-all duration-200 ease-out motion-reduce:transition-none',
          isCollapsed ? 'opacity-0 translate-x-1 pointer-events-none' : 'opacity-100 translate-x-0 pointer-events-auto'
        )}
      >
        <div className="flex flex-col gap-2 mb-3 pb-3 border-b border-sidebar-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                <Filter className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">FILTERS</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-9 w-9 shrink-0"
              title="Collapse filters sidebar"
              aria-label="Collapse filters sidebar"
              aria-expanded={true}
              aria-controls="filters-sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <SavedFiltersManager
              currentFilters={filters}
              onLoadFilters={handleLoadSavedFilters}
              totalActiveFilters={totalActiveFilters}
              onReset={resetFilters}
              onExport={handleExportAll}
              canExport={canExport}
              exportBlockedMessage="You are not allowed to export data. Please contact an admin."
            />
          </div>
        </div>

        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="w-full space-y-2">
          {isSectionVisible("accounts") && (
          <AccordionItem value="accounts" className="overflow-hidden rounded-xl border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <Building className="h-4 w-4 text-primary" />
                <span className="uppercase tracking-wider text-[12px]">Account Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              <AccountFiltersSection
                pendingFilters={pendingFilters}
                availableOptions={availableOptions}
                isApplying={isApplying}
                activeFilter={activeFilter}
                setPendingFilters={setPendingFilters}
                setActiveFilter={setActiveFilter}
                accountNames={accountNames}
                revenueRange={revenueRange}
                yearsInIndiaRange={yearsInIndiaRange}
                handleMinRevenueChange={handleMinRevenueChange}
                handleMaxRevenueChange={handleMaxRevenueChange}
                handleRevenueRangeChange={handleRevenueRangeChange}
                handleMinYearsInIndiaChange={handleMinYearsInIndiaChange}
                handleMaxYearsInIndiaChange={handleMaxYearsInIndiaChange}
                handleYearsInIndiaRangeChange={handleYearsInIndiaRangeChange}
                formatRevenueInMillions={formatRevenueInMillions}
              />
            </AccordionContent>
          </AccordionItem>
          )}

          {isSectionVisible("centers") && (
          <AccordionItem value="centers" className="overflow-hidden rounded-xl border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <Briefcase className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                <span className="uppercase tracking-wider text-[12px]">Center Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
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
            </AccordionContent>
          </AccordionItem>
          )}

          {isSectionVisible("prospects") && (
          <AccordionItem value="prospects" className="overflow-hidden rounded-xl border border-border/70 bg-secondary/30 px-3 data-[state=open]:bg-background data-[state=open]:shadow-sm">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-[hsl(var(--chart-3))]" />
                <span className="uppercase tracking-wider text-[12px]">Prospect Attributes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-1">
              <ProspectFiltersSection
                pendingFilters={pendingFilters}
                availableOptions={availableOptions}
                isApplying={isApplying}
                activeFilter={activeFilter}
                setPendingFilters={setPendingFilters}
                setActiveFilter={setActiveFilter}
              />
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
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 border border-primary/40 animate-bounce">
            <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 translate-y-[0.5px]" />
          </div>
        </div>
      </div>
    </aside>
  )
}
