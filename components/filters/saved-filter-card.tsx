import { memo } from "react"
import { Calendar, Edit2, Filter, Share2, Trash2, Users } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { Filters } from "@/lib/types"
import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import {
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"
import { FilterBadge, renderFilterValues } from "@/components/filters/filter-badge"

const ACCOUNT_VISIBILITY_LABELS = {
  all: "ALL",
  gcc: "GCCs",
  nonGcc: "NON-GCCs",
} as const

export interface SavedFilter {
  id: string
  name: string
  filters: Filters
  created_at: string
  updated_at: string
  user_id: string
  owner_email?: string
}

interface SavedFilterCardProps {
  filter: SavedFilter
  isOwner: boolean
  onLoad: (filter: SavedFilter) => void
  onEdit: (filter: SavedFilter) => void
  onDelete: (filter: SavedFilter) => void
  onShare?: (filter: SavedFilter) => void
}

export const SavedFilterCard = memo(({
  filter,
  isOwner,
  onLoad,
  onEdit,
  onDelete,
  onShare,
}: SavedFilterCardProps) => {
  const filterCount = calculateActiveFilters(filter.filters)

  const [minRevenue, maxRevenue] = filter.filters.accountHqRevenueRange || DEFAULT_REVENUE_RANGE
  const revenueFilterActive = minRevenue !== DEFAULT_REVENUE_RANGE[0] || maxRevenue !== DEFAULT_REVENUE_RANGE[1]
  const [minYearsInIndia, maxYearsInIndia] = filter.filters.accountYearsInIndiaRange || DEFAULT_YEARS_IN_INDIA_RANGE
  const yearsInIndiaFilterActive =
    minYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[0] || maxYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[1]
  const [minCenterIncYear, maxCenterIncYear] = filter.filters.centerIncYearRange || DEFAULT_CENTER_INC_YEAR_RANGE
  const centerIncYearFilterActive =
    minCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[0] || maxCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[1]
  const accountVisibilityMode = filter.filters.accountVisibilityMode ?? "gcc"
  const accountVisibilityFilterActive = accountVisibilityMode !== "gcc"

  const createdDate = new Date(filter.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  const updatedDate = filter.updated_at !== filter.created_at
    ? new Date(filter.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background/50 transition-colors hover:border-border">

          {/* Card header: mirrors user info avatar row */}
          <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{filter.name}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {filterCount} filters
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {!isOwner && filter.owner_email && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />
                    Shared by {filter.owner_email}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5" />
                  {createdDate}
                </span>
                {updatedDate && (
                  <span className="text-[11px] text-muted-foreground">
                    (updated {updatedDate})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mx-4 border-t border-border/40" />

          {/* Filter details accordion */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-b-0">
              <AccordionTrigger className="px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
                View filter details
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                <div className="flex flex-wrap gap-1">
                  {accountVisibilityFilterActive && (
                    <FilterBadge
                      filterKey="Account Visibility"
                      value={ACCOUNT_VISIBILITY_LABELS[accountVisibilityMode]}
                    />
                  )}
                  {renderFilterValues(filter.filters.accountGlobalLegalNameKeywords, "Account Name")}
                  {renderFilterValues(filter.filters.accountHqRegionValues, "Region")}
                  {renderFilterValues(filter.filters.accountHqCountryValues, "Country")}
                  {renderFilterValues(filter.filters.accountHqIndustryValues, "Industry")}
                  {renderFilterValues(filter.filters.accountDataCoverageValues, "Data Coverage")}
                  {renderFilterValues(filter.filters.accountSourceValues, "Account Source")}
                  {renderFilterValues(filter.filters.accountTypeValues, "Account Type")}
                  {renderFilterValues(filter.filters.accountPrimaryCategoryValues, "Category")}
                  {renderFilterValues(filter.filters.accountPrimaryNatureValues, "Nature")}
                  {renderFilterValues(filter.filters.accountNasscomStatusValues, "NASSCOM")}
                  {renderFilterValues(filter.filters.accountHqEmployeeRangeValues, "Emp Range")}
                  {renderFilterValues(filter.filters.accountCenterEmployeesRangeValues, "Center Emp")}
                  {renderFilterValues(filter.filters.centerTypeValues, "Center Type")}
                  {renderFilterValues(filter.filters.centerFocusValues, "Center Focus")}
                  {renderFilterValues(filter.filters.centerCityValues, "City")}
                  {renderFilterValues(filter.filters.centerStateValues, "State")}
                  {renderFilterValues(filter.filters.centerCountryValues, "Center Country")}
                  {renderFilterValues(filter.filters.centerEmployeesRangeValues, "Center Employees")}
                  {renderFilterValues(filter.filters.centerStatusValues, "Center Status")}
                  {renderFilterValues(filter.filters.functionNameValues, "Function")}
                  {renderFilterValues(filter.filters.techSoftwareInUseKeywords, "Software In Use")}
                  {renderFilterValues(filter.filters.prospectDepartmentValues, "Department")}
                  {renderFilterValues(filter.filters.prospectHeadTypeValues, "Role")}
                  {renderFilterValues(filter.filters.prospectLevelValues, "Level")}
                  {renderFilterValues(filter.filters.prospectCityValues, "Prospect City")}
                  {renderFilterValues(filter.filters.prospectTitleKeywords, "Job Title")}
                  {revenueFilterActive && (
                    <FilterBadge filterKey="Revenue" value={`${minRevenue.toLocaleString()} - ${maxRevenue.toLocaleString()}`} />
                  )}
                  {filter.filters.accountHqRevenueIncludeNull && (
                    <FilterBadge filterKey="Revenue" value="Include null" />
                  )}
                  {yearsInIndiaFilterActive && (
                    <FilterBadge filterKey="Years In India" value={`${minYearsInIndia} - ${maxYearsInIndia}`} />
                  )}
                  {filter.filters.yearsInIndiaIncludeNull && (
                    <FilterBadge filterKey="Years In India" value="Include null" />
                  )}
                  {centerIncYearFilterActive && (
                    <FilterBadge filterKey="Inc. Year" value={`${minCenterIncYear} - ${maxCenterIncYear}`} />
                  )}
                  {filter.filters.centerIncYearIncludeNull && (
                    <FilterBadge filterKey="Inc. Year" value="Include null" />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mx-4 border-t border-border/40" />

          {/* Action row: mirrors header dropdown action grid */}
          <div className="flex items-stretch gap-1 p-1.5">
            <button
              type="button"
              onClick={() => onLoad(filter)}
              className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-primary/25 bg-primary/5 px-2 py-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              <Filter className="h-3.5 w-3.5" />
              Load
            </button>

            {isOwner && onShare && (
              <button
                type="button"
                onClick={() => onShare(filter)}
                className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
                aria-label={`Share ${filter.name}`}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => onEdit(filter)}
                className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
                aria-label={`Rename ${filter.name}`}
              >
                <Edit2 className="h-3.5 w-3.5" />
                Rename
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => onDelete(filter)}
                className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-destructive/25 bg-destructive/5 px-2 py-2 text-[11px] font-medium text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10"
                aria-label={`Delete ${filter.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onLoad(filter)}>
          <Filter className="h-4 w-4" />
          Load Filters
        </ContextMenuItem>
        {isOwner && (
          <>
            <ContextMenuSeparator />
            {onShare && (
              <ContextMenuItem onClick={() => onShare(filter)}>
                <Share2 className="h-4 w-4" />
                Share
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => onEdit(filter)}>
              <Edit2 className="h-4 w-4" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => onDelete(filter)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})
SavedFilterCard.displayName = "SavedFilterCard"
