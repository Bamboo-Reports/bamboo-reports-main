import React from "react"
import { toast } from "sonner"
import { EnhancedMultiSelect } from "@/components/enhanced-multi-select"
import { AccountAutocomplete } from "@/components/filters/account-autocomplete"
import { TitleKeywordInput } from "@/components/filters/title-keyword-input"
import { AccountListPicker } from "@/components/filters/account-list-picker"
import { FilterValuesSummary } from "@/components/filters/filter-chip"
import { FilterMoreDivider, FilterRow } from "@/components/filters/filter-row"
import { FilterRangeField, formatRangeSummary, type RangePreset } from "@/components/filters/filter-range-field"
import { isRangeActive } from "@/components/filters/filter-fields"
import { useAccountLists } from "@/contexts/account-lists-context"
import { withAccountLists } from "@/lib/accounts/account-lists"
import { getPremiumFilterKeys, isFilterEnabled, isShowMoreEnabled } from "@/lib/config/filters"
import type { Alias, AvailableOptions, FilterOption, FilterValue, Filters } from "@/lib/types"

interface FilterSectionBaseProps {
  pendingFilters: Filters
  availableOptions: AvailableOptions
  isApplying: boolean
  activeFilter: string | null
  setPendingFilters: React.Dispatch<React.SetStateAction<Filters>>
  setActiveFilter: (filter: string | null) => void
}

type Bounds = { min: number; max: number }

interface AccountFilterSectionProps extends FilterSectionBaseProps {
  accountNames: string[]
  aliases?: Alias[]
  serverMode?: boolean
  revenueRange: Bounds
  yearsInIndiaRange: Bounds
  handleRevenueRangeChange: (value: [number, number]) => void
  handleYearsInIndiaRangeChange: (value: [number, number]) => void
}

interface CenterFilterSectionProps extends FilterSectionBaseProps {
  centerIncYearRange: Bounds
  handleCenterIncYearRangeChange: (value: [number, number]) => void
}

type ProspectFilterSectionProps = FilterSectionBaseProps

type ValuesKey = {
  [K in keyof Filters]: Filters[K] extends FilterValue[] ? K : never
}[keyof Filters] & keyof AvailableOptions

interface ValuesRowProps extends FilterSectionBaseProps {
  filterKey: ValuesKey
  label: string
  /** List the options by size ("<50", "51 - 100") instead of by count. */
  ordered?: boolean
}

/** A list filter (include/exclude any of the options) as a collapsible row. */
function ValuesRow({
  filterKey,
  label,
  ordered,
  pendingFilters,
  availableOptions,
  isApplying,
  activeFilter,
  setPendingFilters,
  setActiveFilter,
}: ValuesRowProps) {
  if (!isFilterEnabled(filterKey)) return null
  const selected = pendingFilters[filterKey]
  const options: FilterOption[] = availableOptions[filterKey] ?? []
  return (
    <FilterRow label={label} active={selected.length > 0} summary={<FilterValuesSummary values={selected} />}>
      <EnhancedMultiSelect
        options={options}
        selected={selected}
        trackingKey={filterKey}
        ordered={ordered}
        onChange={(next) => {
          setPendingFilters((prev) => ({ ...prev, [filterKey]: next }))
          setActiveFilter(filterKey)
        }}
        placeholder="Choose values"
        isApplying={isApplying && activeFilter === filterKey}
      />
    </FilterRow>
  )
}

/** The "More" divider, or a locked one when the plan doesn't include those filters. */
function MoreFilters({ section }: { section: "accounts" | "centers" }) {
  if (getPremiumFilterKeys(section).length === 0) return null
  const procured = isShowMoreEnabled(section)
  return (
    <FilterMoreDivider
      locked={!procured}
      onLockedClick={() => toast.info("Premium filters are Not Procured.")}
    />
  )
}

const CURRENT_YEAR = new Date().getFullYear()

const REVENUE_PRESETS: RangePreset[] = [
  { label: "Under $100M", range: [0, 100] },
  { label: "$100M to $1B", range: [100, 1000] },
  { label: "$1B to $10B", range: [1000, 10000] },
  { label: "$10B+", range: [10000, Number.MAX_SAFE_INTEGER] },
]

const YEARS_IN_INDIA_PRESETS: RangePreset[] = [
  { label: "0 to 5", range: [0, 5] },
  { label: "5 to 15", range: [5, 15] },
  { label: "15+", range: [15, Number.MAX_SAFE_INTEGER] },
]

const INC_YEAR_PRESETS: RangePreset[] = [
  { label: "Last 2 years", range: [CURRENT_YEAR - 2, Number.MAX_SAFE_INTEGER] },
  { label: "Last 5 years", range: [CURRENT_YEAR - 5, Number.MAX_SAFE_INTEGER] },
  { label: "Before 2010", range: [0, 2009] },
]

export function AccountFiltersSection(props: AccountFilterSectionProps) {
  const {
    pendingFilters,
    setPendingFilters,
    accountNames,
    aliases,
    serverMode,
    revenueRange,
    yearsInIndiaRange,
    handleRevenueRangeChange,
    handleYearsInIndiaRangeChange,
  } = props
  const { lists } = useAccountLists()

  const accountListNames = pendingFilters.accountListValues.map((item) => ({
    ...item,
    value: lists.find((list) => list.id === item.value)?.name ?? "List",
  }))
  const revenueIncludeNull = isFilterEnabled("accountHqRevenueIncludeNull")
  const yearsIncludeNull = isFilterEnabled("yearsInIndiaIncludeNull")

  return (
    <div>
      {isFilterEnabled("accountGlobalLegalNameKeywords") && (
        <FilterRow
          label="Account name"
          active={pendingFilters.accountGlobalLegalNameKeywords.length > 0}
          summary={<FilterValuesSummary values={pendingFilters.accountGlobalLegalNameKeywords} />}
        >
          <AccountAutocomplete
            accountNames={accountNames}
            aliases={aliases}
            serverSuggest={serverMode}
            selectedAccounts={pendingFilters.accountGlobalLegalNameKeywords}
            onChange={(keywords) => setPendingFilters((prev) => ({ ...prev, accountGlobalLegalNameKeywords: keywords }))}
            placeholder="Search account names"
            trackingKey="accountGlobalLegalNameKeywords"
          />
        </FilterRow>
      )}

      {isFilterEnabled("accountListValues") && (
        <FilterRow
          label="Account list"
          active={pendingFilters.accountListValues.length > 0 || pendingFilters.accountNameValues.length > 0}
          summary={
            accountListNames.length > 0
              ? <FilterValuesSummary values={accountListNames} />
              : `${pendingFilters.accountNameValues.length.toLocaleString()} accounts`
          }
        >
          <AccountListPicker
            selected={pendingFilters.accountListValues}
            accountNameCount={pendingFilters.accountNameValues.length}
            onChange={(selection, nextLists) => setPendingFilters((prev) => withAccountLists(prev, selection, nextLists))}
            onClearNames={() => setPendingFilters((prev) => ({ ...prev, accountListValues: [], accountNameValues: [] }))}
          />
        </FilterRow>
      )}

      {isFilterEnabled("accountHqRevenueRange") && (
        <FilterRow
          label="HQ revenue"
          active={isRangeActive(pendingFilters.accountHqRevenueRange, revenueRange, !revenueIncludeNull || pendingFilters.accountHqRevenueIncludeNull)}
          summary={formatRangeSummary(pendingFilters.accountHqRevenueRange, revenueRange, !revenueIncludeNull || pendingFilters.accountHqRevenueIncludeNull, "money")}
        >
          <FilterRangeField
            label="HQ revenue"
            unit="money"
            value={pendingFilters.accountHqRevenueRange}
            bounds={revenueRange}
            onChange={handleRevenueRangeChange}
            presets={REVENUE_PRESETS}
            includeNull={revenueIncludeNull ? pendingFilters.accountHqRevenueIncludeNull : undefined}
            onIncludeNullChange={
              revenueIncludeNull
                ? (includeNull) => setPendingFilters((prev) => ({ ...prev, accountHqRevenueIncludeNull: includeNull }))
                : undefined
            }
            includeNullLabel="Include accounts with no revenue data"
          />
        </FilterRow>
      )}

      <ValuesRow {...props} filterKey="accountCenterEmployeesRangeValues" label="GCC headcount (India)" ordered />

      {isFilterEnabled("accountYearsInIndiaRange") && (
        <FilterRow
          label="Years in India"
          active={isRangeActive(pendingFilters.accountYearsInIndiaRange, yearsInIndiaRange, !yearsIncludeNull || pendingFilters.yearsInIndiaIncludeNull)}
          summary={formatRangeSummary(pendingFilters.accountYearsInIndiaRange, yearsInIndiaRange, !yearsIncludeNull || pendingFilters.yearsInIndiaIncludeNull, "years")}
        >
          <FilterRangeField
            label="Years in India"
            unit="years"
            value={pendingFilters.accountYearsInIndiaRange}
            bounds={yearsInIndiaRange}
            onChange={handleYearsInIndiaRangeChange}
            presets={YEARS_IN_INDIA_PRESETS}
            includeNull={yearsIncludeNull ? pendingFilters.yearsInIndiaIncludeNull : undefined}
            onIncludeNullChange={
              yearsIncludeNull
                ? (includeNull) => setPendingFilters((prev) => ({ ...prev, yearsInIndiaIncludeNull: includeNull }))
                : undefined
            }
            includeNullLabel="Include accounts with no start year"
          />
        </FilterRow>
      )}

      <ValuesRow {...props} filterKey="accountPrimaryCategoryValues" label="Industry" />
      <ValuesRow {...props} filterKey="accountHqCountryValues" label="HQ country" />

      <MoreFilters section="accounts" />
      <ValuesRow {...props} filterKey="accountHqRegionValues" label="HQ region" />
      <ValuesRow {...props} filterKey="accountHqEmployeeRangeValues" label="HQ employee range" ordered />
      <ValuesRow {...props} filterKey="accountHqIndustryValues" label="Sub industry" />
      <ValuesRow {...props} filterKey="accountPrimaryNatureValues" label="Segment" />
      <ValuesRow {...props} filterKey="accountNasscomStatusValues" label="NASSCOM listing" />
      <ValuesRow {...props} filterKey="accountSourceValues" label="Source" />
      <ValuesRow {...props} filterKey="accountTypeValues" label="Type" />
      <ValuesRow {...props} filterKey="accountDataCoverageValues" label="Coverage" />
    </div>
  )
}

export function CenterFiltersSection(props: CenterFilterSectionProps) {
  const { pendingFilters, setPendingFilters, centerIncYearRange, handleCenterIncYearRangeChange } = props
  const incYearIncludeNull = isFilterEnabled("centerIncYearIncludeNull")

  return (
    <div>
      <ValuesRow {...props} filterKey="centerStatusValues" label="Status" />
      <ValuesRow {...props} filterKey="centerTypeValues" label="Centre type" />
      <ValuesRow {...props} filterKey="functionNameValues" label="Services offered" />
      <ValuesRow {...props} filterKey="centerCityValues" label="City" />

      {isFilterEnabled("centerIncYearRange") && (
        <FilterRow
          label="Incorporation year"
          active={isRangeActive(pendingFilters.centerIncYearRange, centerIncYearRange, !incYearIncludeNull || pendingFilters.centerIncYearIncludeNull)}
          summary={formatRangeSummary(pendingFilters.centerIncYearRange, centerIncYearRange, !incYearIncludeNull || pendingFilters.centerIncYearIncludeNull, "year")}
        >
          <FilterRangeField
            label="Incorporation year"
            unit="year"
            value={pendingFilters.centerIncYearRange}
            bounds={centerIncYearRange}
            onChange={handleCenterIncYearRangeChange}
            presets={INC_YEAR_PRESETS}
            includeNull={incYearIncludeNull ? pendingFilters.centerIncYearIncludeNull : undefined}
            onIncludeNullChange={
              incYearIncludeNull
                ? (includeNull) => setPendingFilters((prev) => ({ ...prev, centerIncYearIncludeNull: includeNull }))
                : undefined
            }
            includeNullLabel="Include centres with no year"
          />
        </FilterRow>
      )}

      <ValuesRow {...props} filterKey="centerEmployeesRangeValues" label="Centre headcount" ordered />

      <MoreFilters section="centers" />
      <ValuesRow {...props} filterKey="centerStateValues" label="State" />
      <ValuesRow {...props} filterKey="centerFocusValues" label="Centre focus" />
      {isFilterEnabled("techSoftwareInUseKeywords") && (
        <FilterRow
          label="Software in use"
          active={pendingFilters.techSoftwareInUseKeywords.length > 0}
          summary={<FilterValuesSummary values={pendingFilters.techSoftwareInUseKeywords} />}
        >
          <TitleKeywordInput
            keywords={pendingFilters.techSoftwareInUseKeywords}
            onChange={(keywords) => setPendingFilters((prev) => ({ ...prev, techSoftwareInUseKeywords: keywords }))}
            placeholder="e.g. SAP, Oracle, Workday"
            trackingKey="techSoftwareInUseKeywords"
          />
        </FilterRow>
      )}
      <ValuesRow {...props} filterKey="centerCountryValues" label="Country" />
    </div>
  )
}

export function ProspectFiltersSection(props: ProspectFilterSectionProps) {
  const { pendingFilters, setPendingFilters } = props

  return (
    <div>
      {isFilterEnabled("prospectTitleKeywords") && (
        <FilterRow
          label="Job title"
          active={pendingFilters.prospectTitleKeywords.length > 0}
          summary={<FilterValuesSummary values={pendingFilters.prospectTitleKeywords} />}
        >
          <TitleKeywordInput
            keywords={pendingFilters.prospectTitleKeywords}
            onChange={(keywords) => setPendingFilters((prev) => ({ ...prev, prospectTitleKeywords: keywords }))}
            placeholder="e.g. Manager, Director, VP"
            trackingKey="prospectTitleKeywords"
          />
        </FilterRow>
      )}
      <ValuesRow {...props} filterKey="prospectHeadTypeValues" label="Role" />
      <ValuesRow {...props} filterKey="prospectLevelValues" label="Seniority level" />
      <ValuesRow {...props} filterKey="prospectDepartmentValues" label="Department" />
      <ValuesRow {...props} filterKey="prospectCityValues" label="City" />
      <ValuesRow {...props} filterKey="prospectEngagedValues" label="Engaged" />
    </div>
  )
}
