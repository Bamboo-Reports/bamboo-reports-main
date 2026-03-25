import React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { EnhancedMultiSelect } from "@/components/enhanced-multi-select"
import { AccountAutocomplete } from "@/components/filters/account-autocomplete"
import { TitleKeywordInput } from "@/components/filters/title-keyword-input"
import { isFilterEnabled } from "@/lib/config/filters"
import type { Filters, AvailableOptions } from "@/lib/types"

interface FilterSectionBaseProps {
  pendingFilters: Filters
  availableOptions: AvailableOptions
  isApplying: boolean
  activeFilter: string | null
  setPendingFilters: React.Dispatch<React.SetStateAction<Filters>>
  setActiveFilter: (filter: string | null) => void
}

interface AccountFilterSectionProps extends FilterSectionBaseProps {
  accountNames: string[]
  revenueRange: { min: number; max: number }
  yearsInIndiaRange: { min: number; max: number }
  handleMinRevenueChange: (value: string) => void
  handleMaxRevenueChange: (value: string) => void
  handleRevenueRangeChange: (value: [number, number]) => void
  handleMinYearsInIndiaChange: (value: string) => void
  handleMaxYearsInIndiaChange: (value: string) => void
  handleYearsInIndiaRangeChange: (value: [number, number]) => void
  formatRevenueInMillions: (value: number) => string
}

interface CenterFilterSectionProps extends FilterSectionBaseProps {
  centerIncYearRange: { min: number; max: number }
  handleMinCenterIncYearChange: (value: string) => void
  handleMaxCenterIncYearChange: (value: string) => void
  handleCenterIncYearRangeChange: (value: [number, number]) => void
}

interface ProspectFilterSectionProps extends FilterSectionBaseProps {}

export function AccountFiltersSection({
  pendingFilters,
  availableOptions,
  isApplying,
  activeFilter,
  setPendingFilters,
  setActiveFilter,
  accountNames,
  revenueRange,
  yearsInIndiaRange,
  handleMinRevenueChange,
  handleMaxRevenueChange,
  handleRevenueRangeChange,
  handleMinYearsInIndiaChange,
  handleMaxYearsInIndiaChange,
  handleYearsInIndiaRangeChange,
  formatRevenueInMillions,
}: AccountFilterSectionProps) {
  return (
    <div className="pr-2">
        <div className="space-y-4 pt-2">
          <div className="space-y-3">
            {isFilterEnabled("accountHqRevenueRange") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Revenue (USDMn)</Label>
                {isFilterEnabled("accountHqRevenueIncludeNull") && (
                <div className="flex items-center gap-2">
                <Checkbox
                  id="include-null-revenue"
                  checked={pendingFilters.accountHqRevenueIncludeNull}
                  onCheckedChange={(checked) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      accountHqRevenueIncludeNull: checked === true,
                    }))
                  }
                  className="h-3.5 w-3.5"
                />
                <Label
                  htmlFor="include-null-revenue"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Include all
                </Label>
              </div>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="min-revenue" className="text-xs">Min</Label>
                <Input
                  id="min-revenue"
                  type="number"
                  value={pendingFilters.accountHqRevenueRange[0]}
                  onChange={(e) => handleMinRevenueChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  min={revenueRange.min}
                  max={pendingFilters.accountHqRevenueRange[1]}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-revenue" className="text-xs">Max</Label>
                <Input
                  id="max-revenue"
                  type="number"
                  value={pendingFilters.accountHqRevenueRange[1]}
                  onChange={(e) => handleMaxRevenueChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  min={pendingFilters.accountHqRevenueRange[0]}
                  max={revenueRange.max}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div className="px-2">
              <Slider
                value={pendingFilters.accountHqRevenueRange}
                onValueChange={(value) => handleRevenueRangeChange(value as [number, number])}
                min={revenueRange.min}
                max={revenueRange.max}
                step={Math.max(1, Math.floor((revenueRange.max - revenueRange.min) / 1000))}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-2">
              <span>{formatRevenueInMillions(revenueRange.min)}</span>
              <span>{formatRevenueInMillions(revenueRange.max)}</span>
            </div>
          </div>
            )}

          {isFilterEnabled("accountGlobalLegalNameKeywords") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Account Name</Label>
            <AccountAutocomplete
              accountNames={accountNames}
              selectedAccounts={pendingFilters.accountGlobalLegalNameKeywords}
              onChange={(keywords) => setPendingFilters((prev) => ({ ...prev, accountGlobalLegalNameKeywords: keywords }))}
              placeholder="Type to search account names..."
              trackingKey="accountGlobalLegalNameKeywords"
            />
          </div>
          )}

          {isFilterEnabled("accountHqEmployeeRangeValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Employee Range</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountHqEmployeeRangeValues}
              selected={pendingFilters.accountHqEmployeeRangeValues}
              trackingKey="accountHqEmployeeRangeValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountHqEmployeeRangeValues: selected }))
                setActiveFilter("accountHqEmployeeRangeValues")
              }}
              placeholder="Select employees range..."
              isApplying={isApplying && activeFilter === "accountHqEmployeeRangeValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountCenterEmployeesRangeValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Aggregate India Headcount</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountCenterEmployeesRangeValues}
              selected={pendingFilters.accountCenterEmployeesRangeValues}
              trackingKey="accountCenterEmployeesRangeValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountCenterEmployeesRangeValues: selected }))
                setActiveFilter("accountCenterEmployeesRangeValues")
              }}
              placeholder="Select center employees..."
              isApplying={isApplying && activeFilter === "accountCenterEmployeesRangeValues"}
            />
          </div>
          )}

          {isFilterEnabled("accountYearsInIndiaRange") && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Years In India</Label>
              {isFilterEnabled("yearsInIndiaIncludeNull") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-null-years-in-india"
                  checked={pendingFilters.yearsInIndiaIncludeNull}
                  onCheckedChange={(checked) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      yearsInIndiaIncludeNull: checked === true,
                    }))
                  }
                  className="h-3.5 w-3.5"
                />
                <Label
                  htmlFor="include-null-years-in-india"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Include all
                </Label>
              </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="min-years-in-india" className="text-xs">Min</Label>
                <Input
                  id="min-years-in-india"
                  type="number"
                  value={pendingFilters.accountYearsInIndiaRange[0]}
                  onChange={(e) => handleMinYearsInIndiaChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  min={yearsInIndiaRange.min}
                  max={pendingFilters.accountYearsInIndiaRange[1]}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-years-in-india" className="text-xs">Max</Label>
                <Input
                  id="max-years-in-india"
                  type="number"
                  value={pendingFilters.accountYearsInIndiaRange[1]}
                  onChange={(e) => handleMaxYearsInIndiaChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  min={pendingFilters.accountYearsInIndiaRange[0]}
                  max={yearsInIndiaRange.max}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div className="px-2">
              <Slider
                value={pendingFilters.accountYearsInIndiaRange}
                onValueChange={(value) => handleYearsInIndiaRangeChange(value as [number, number])}
                min={yearsInIndiaRange.min}
                max={yearsInIndiaRange.max}
                step={1}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-2">
              <span>{yearsInIndiaRange.min.toLocaleString()}</span>
              <span>{yearsInIndiaRange.max.toLocaleString()}</span>
            </div>
          </div>
          )}

          {isFilterEnabled("accountHqRegionValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Region</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountHqRegionValues || []}
              selected={pendingFilters.accountHqRegionValues}
              trackingKey="accountHqRegionValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountHqRegionValues: selected }))
                setActiveFilter("accountHqRegionValues")
              }}
              placeholder="Select regions..."
              isApplying={isApplying && activeFilter === "accountHqRegionValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountHqCountryValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Country</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountHqCountryValues || []}
              selected={pendingFilters.accountHqCountryValues}
              trackingKey="accountHqCountryValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountHqCountryValues: selected }))
                setActiveFilter("accountHqCountryValues")
              }}
              placeholder="Select countries..."
              isApplying={isApplying && activeFilter === "accountHqCountryValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountPrimaryNatureValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Segment</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountPrimaryNatureValues}
              selected={pendingFilters.accountPrimaryNatureValues}
              trackingKey="accountPrimaryNatureValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountPrimaryNatureValues: selected }))
                setActiveFilter("accountPrimaryNatureValues")
              }}
              placeholder="Select nature..."
              isApplying={isApplying && activeFilter === "accountPrimaryNatureValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountPrimaryCategoryValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Category</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountPrimaryCategoryValues}
              selected={pendingFilters.accountPrimaryCategoryValues}
              trackingKey="accountPrimaryCategoryValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountPrimaryCategoryValues: selected }))
                setActiveFilter("accountPrimaryCategoryValues")
              }}
              placeholder="Select categories..."
              isApplying={isApplying && activeFilter === "accountPrimaryCategoryValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountHqIndustryValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Industry</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountHqIndustryValues}
              selected={pendingFilters.accountHqIndustryValues}
              trackingKey="accountHqIndustryValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountHqIndustryValues: selected }))
                setActiveFilter("accountHqIndustryValues")
              }}
              placeholder="Select industries..."
              isApplying={isApplying && activeFilter === "accountHqIndustryValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountNasscomStatusValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">NASSCOM Status</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountNasscomStatusValues}
              selected={pendingFilters.accountNasscomStatusValues}
              trackingKey="accountNasscomStatusValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountNasscomStatusValues: selected }))
                setActiveFilter("accountNasscomStatusValues")
              }}
              placeholder="Select NASSCOM status..."
              isApplying={isApplying && activeFilter === "accountNasscomStatusValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountSourceValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Source</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountSourceValues}
              selected={pendingFilters.accountSourceValues}
              trackingKey="accountSourceValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountSourceValues: selected }))
                setActiveFilter("accountSourceValues")
              }}
              placeholder="Select account source..."
              isApplying={isApplying && activeFilter === "accountSourceValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountTypeValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Type</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountTypeValues || []}
              selected={pendingFilters.accountTypeValues}
              trackingKey="accountTypeValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountTypeValues: selected }))
                setActiveFilter("accountTypeValues")
              }}
              placeholder="Select account types..."
              isApplying={isApplying && activeFilter === "accountTypeValues"}
            />
          </div>
          )}
          {isFilterEnabled("accountDataCoverageValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Coverage</Label>
            <EnhancedMultiSelect
              options={availableOptions.accountDataCoverageValues}
              selected={pendingFilters.accountDataCoverageValues}
              trackingKey="accountDataCoverageValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, accountDataCoverageValues: selected }))
                setActiveFilter("accountDataCoverageValues")
              }}
              placeholder="Select data coverage..."
              isApplying={isApplying && activeFilter === "accountDataCoverageValues"}
            />
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CenterFiltersSection({
  pendingFilters,
  availableOptions,
  isApplying,
  activeFilter,
  setPendingFilters,
  setActiveFilter,
  centerIncYearRange,
  handleMinCenterIncYearChange,
  handleMaxCenterIncYearChange,
  handleCenterIncYearRangeChange,
}: CenterFilterSectionProps) {
  return (
    <div className="pr-2">
      <div className="space-y-4 pt-2">
        <div className="space-y-3">
          {isFilterEnabled("centerIncYearRange") && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Incorporation Timeline</Label>
              {isFilterEnabled("centerIncYearIncludeNull") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-null-center-inc-year"
                  checked={pendingFilters.centerIncYearIncludeNull}
                  onCheckedChange={(checked) =>
                    setPendingFilters((prev) => ({
                      ...prev,
                      centerIncYearIncludeNull: checked === true,
                    }))
                  }
                  className="h-3.5 w-3.5"
                />
                <Label
                  htmlFor="include-null-center-inc-year"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Include all
                </Label>
              </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="min-center-inc-year" className="text-xs">Min</Label>
                <Input
                  id="min-center-inc-year"
                  type="number"
                  value={pendingFilters.centerIncYearRange[0]}
                  onChange={(e) => handleMinCenterIncYearChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => {
                    const clamped = Math.max(centerIncYearRange.min, Math.min(pendingFilters.centerIncYearRange[0], pendingFilters.centerIncYearRange[1]))
                    setPendingFilters((prev) => ({ ...prev, centerIncYearRange: [clamped, prev.centerIncYearRange[1]] }))
                  }}
                  min={centerIncYearRange.min}
                  max={pendingFilters.centerIncYearRange[1]}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-center-inc-year" className="text-xs">Max</Label>
                <Input
                  id="max-center-inc-year"
                  type="number"
                  value={pendingFilters.centerIncYearRange[1]}
                  onChange={(e) => handleMaxCenterIncYearChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => {
                    const clamped = Math.min(centerIncYearRange.max, Math.max(pendingFilters.centerIncYearRange[1], pendingFilters.centerIncYearRange[0]))
                    setPendingFilters((prev) => ({ ...prev, centerIncYearRange: [prev.centerIncYearRange[0], clamped] }))
                  }}
                  min={pendingFilters.centerIncYearRange[0]}
                  max={centerIncYearRange.max}
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div className="px-2">
              <Slider
                value={pendingFilters.centerIncYearRange}
                onValueChange={(value) => handleCenterIncYearRangeChange(value as [number, number])}
                min={centerIncYearRange.min}
                max={centerIncYearRange.max}
                step={1}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-2">
              <span>{centerIncYearRange.min.toLocaleString()}</span>
              <span>{centerIncYearRange.max.toLocaleString()}</span>
            </div>
          </div>
          )}

          {isFilterEnabled("centerStatusValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Status</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerStatusValues}
              selected={pendingFilters.centerStatusValues}
              trackingKey="centerStatusValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerStatusValues: selected }))
                setActiveFilter("centerStatusValues")
              }}
              placeholder="Select status..."
              isApplying={isApplying && activeFilter === "centerStatusValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerEmployeesRangeValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Center Headcount</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerEmployeesRangeValues}
              selected={pendingFilters.centerEmployeesRangeValues}
              trackingKey="centerEmployeesRangeValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerEmployeesRangeValues: selected }))
                setActiveFilter("centerEmployeesRangeValues")
              }}
              placeholder="Select employees range..."
              isApplying={isApplying && activeFilter === "centerEmployeesRangeValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerCountryValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Country</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerCountryValues}
              selected={pendingFilters.centerCountryValues}
              trackingKey="centerCountryValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerCountryValues: selected }))
                setActiveFilter("centerCountryValues")
              }}
              placeholder="Select countries..."
              isApplying={isApplying && activeFilter === "centerCountryValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerStateValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">State</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerStateValues}
              selected={pendingFilters.centerStateValues}
              trackingKey="centerStateValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerStateValues: selected }))
                setActiveFilter("centerStateValues")
              }}
              placeholder="Select states..."
              isApplying={isApplying && activeFilter === "centerStateValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerCityValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">City</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerCityValues}
              selected={pendingFilters.centerCityValues}
              trackingKey="centerCityValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerCityValues: selected }))
                setActiveFilter("centerCityValues")
              }}
              placeholder="Select cities..."
              isApplying={isApplying && activeFilter === "centerCityValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerFocusValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Focus</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerFocusValues}
              selected={pendingFilters.centerFocusValues}
              trackingKey="centerFocusValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerFocusValues: selected }))
                setActiveFilter("centerFocusValues")
              }}
              placeholder="Select focus..."
              isApplying={isApplying && activeFilter === "centerFocusValues"}
            />
          </div>
          )}
          {isFilterEnabled("centerTypeValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Type</Label>
            <EnhancedMultiSelect
              options={availableOptions.centerTypeValues}
              selected={pendingFilters.centerTypeValues}
              trackingKey="centerTypeValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, centerTypeValues: selected }))
                setActiveFilter("centerTypeValues")
              }}
              placeholder="Select types..."
              isApplying={isApplying && activeFilter === "centerTypeValues"}
            />
          </div>
          )}

          {isFilterEnabled("functionNameValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Services Offered</Label>
            <EnhancedMultiSelect
              options={availableOptions.functionNameValues}
              selected={pendingFilters.functionNameValues}
              trackingKey="functionNameValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, functionNameValues: selected }))
                setActiveFilter("functionNameValues")
              }}
              placeholder="Select functions..."
              isApplying={isApplying && activeFilter === "functionNameValues"}
            />
          </div>
          )}
          {isFilterEnabled("techSoftwareInUseKeywords") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Software In Use</Label>
            <TitleKeywordInput
              keywords={pendingFilters.techSoftwareInUseKeywords}
              onChange={(keywords) =>
                setPendingFilters((prev) => ({ ...prev, techSoftwareInUseKeywords: keywords }))
              }
              placeholder="e.g., SAP, Oracle, Workday..."
              trackingKey="techSoftwareInUseKeywords"
            />
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProspectFiltersSection({
  pendingFilters,
  availableOptions,
  isApplying,
  activeFilter,
  setPendingFilters,
  setActiveFilter,
}: ProspectFilterSectionProps) {
  return (
    <div className="pr-2">
      <div className="space-y-4 pt-2">
        <div className="space-y-3">
          {isFilterEnabled("prospectDepartmentValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Department</Label>
            <EnhancedMultiSelect
              options={availableOptions.prospectDepartmentValues || []}
              selected={pendingFilters.prospectDepartmentValues}
              trackingKey="prospectDepartmentValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, prospectDepartmentValues: selected }))
                setActiveFilter("prospectDepartmentValues")
              }}
              placeholder="Select departments..."
              isApplying={isApplying && activeFilter === "prospectDepartmentValues"}
            />
          </div>
          )}
          {isFilterEnabled("prospectLevelValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Seniority Level</Label>
            <EnhancedMultiSelect
              options={availableOptions.prospectLevelValues || []}
              selected={pendingFilters.prospectLevelValues}
              trackingKey="prospectLevelValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, prospectLevelValues: selected }))
                setActiveFilter("prospectLevelValues")
              }}
              placeholder="Select levels..."
              isApplying={isApplying && activeFilter === "prospectLevelValues"}
            />
          </div>
          )}
          {isFilterEnabled("prospectCityValues") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">City</Label>
            <EnhancedMultiSelect
              options={availableOptions.prospectCityValues || []}
              selected={pendingFilters.prospectCityValues}
              trackingKey="prospectCityValues"
              onChange={(selected) => {
                setPendingFilters((prev) => ({ ...prev, prospectCityValues: selected }))
                setActiveFilter("prospectCityValues")
              }}
              placeholder="Select cities..."
              isApplying={isApplying && activeFilter === "prospectCityValues"}
            />
          </div>
          )}
          {isFilterEnabled("prospectTitleKeywords") && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Job Title</Label>
            <TitleKeywordInput
              keywords={pendingFilters.prospectTitleKeywords}
              onChange={(keywords) => setPendingFilters((prev) => ({ ...prev, prospectTitleKeywords: keywords }))}
              placeholder="e.g., Manager, Director, VP..."
              trackingKey="prospectTitleKeywords"
            />
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
