
import { memo, useCallback } from "react"
import { Calendar, Edit, Filter, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Filters } from "@/lib/types"
import { calculateActiveFilters } from "@/lib/dashboard/filter-summary"
import {
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"
import { FilterBadge, renderFilterValues } from "@/components/filters/filter-badge"

export interface SavedFilter {
  id: string
  name: string
  filters: Filters
  created_at: string
  updated_at: string
}

interface SavedFilterCardProps {
  filter: SavedFilter
  onLoad: (filter: SavedFilter) => void
  onEdit: (filter: SavedFilter) => void
  onDelete: (filter: SavedFilter) => void
}

export const SavedFilterCard = memo(({
  filter,
  onLoad,
  onEdit,
  onDelete
}: SavedFilterCardProps) => {
  const filterCount = useCallback(() => {
    return calculateActiveFilters(filter.filters)
  }, [filter.filters])

  const [minRevenue, maxRevenue] = filter.filters.accountHqRevenueRange || DEFAULT_REVENUE_RANGE
  const revenueFilterActive = minRevenue !== DEFAULT_REVENUE_RANGE[0] || maxRevenue !== DEFAULT_REVENUE_RANGE[1]
  const [minYearsInIndia, maxYearsInIndia] = filter.filters.accountYearsInIndiaRange || DEFAULT_YEARS_IN_INDIA_RANGE
  const yearsInIndiaFilterActive =
    minYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[0] || maxYearsInIndia !== DEFAULT_YEARS_IN_INDIA_RANGE[1]
  const [minCenterIncYear, maxCenterIncYear] = filter.filters.centerIncYearRange || DEFAULT_CENTER_INC_YEAR_RANGE
  const centerIncYearFilterActive =
    minCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[0] || maxCenterIncYear !== DEFAULT_CENTER_INC_YEAR_RANGE[1]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{filter.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filterCount()} filters</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(filter)}
              aria-label={`Edit saved filter ${filter.name}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(filter)}
              aria-label={`Delete saved filter ${filter.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created: {new Date(filter.created_at).toLocaleDateString()}
          </div>
          {filter.updated_at !== filter.created_at && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Updated: {new Date(filter.updated_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filter Details:</span>
            <Button variant="outline" size="sm" onClick={() => onLoad(filter)}>
              <Filter className="h-4 w-4 mr-2" />
              Load Filters
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
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
            {renderFilterValues(filter.filters.centerTypeValues, "Type")}
            {renderFilterValues(filter.filters.centerFocusValues, "Focus")}
            {renderFilterValues(filter.filters.centerCityValues, "City")}
            {renderFilterValues(filter.filters.centerStateValues, "State")}
            {renderFilterValues(filter.filters.centerCountryValues, "Center Country")}
            {renderFilterValues(filter.filters.centerEmployeesRangeValues, "Center Employees")}
            {renderFilterValues(filter.filters.centerStatusValues, "Center Status")}
            {renderFilterValues(filter.filters.functionNameValues, "Function")}
            {renderFilterValues(filter.filters.techSoftwareInUseKeywords, "Software In Use")}
            {renderFilterValues(filter.filters.prospectDepartmentValues, "Department")}
            {renderFilterValues(filter.filters.prospectLevelValues, "Prospect Level")}
            {renderFilterValues(filter.filters.prospectCityValues, "Prospect City")}
            {renderFilterValues(filter.filters.prospectTitleKeywords, "Job Title")}
            {revenueFilterActive && (
              <FilterBadge
                filterKey="Revenue"
                value={`${minRevenue.toLocaleString()} - ${maxRevenue.toLocaleString()}`}
              />
            )}
            {filter.filters.accountHqRevenueIncludeNull && (
              <FilterBadge filterKey="Revenue" value="Include null revenue" />
            )}
            {yearsInIndiaFilterActive && (
              <FilterBadge
                filterKey="Years In India"
                value={`${minYearsInIndia.toLocaleString()} - ${maxYearsInIndia.toLocaleString()}`}
              />
            )}
            {filter.filters.yearsInIndiaIncludeNull && (
              <FilterBadge filterKey="Years In India" value="Include null/zero" />
            )}
            {centerIncYearFilterActive && (
              <FilterBadge
                filterKey="Incorporation Timeline"
                value={`${minCenterIncYear.toLocaleString()} - ${maxCenterIncYear.toLocaleString()}`}
              />
            )}
            {filter.filters.centerIncYearIncludeNull && (
              <FilterBadge filterKey="Incorporation Timeline" value="Include null/zero" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
SavedFilterCard.displayName = "SavedFilterCard"
