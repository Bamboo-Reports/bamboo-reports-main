import { isSectionEnabled } from "@/lib/config/dashboard-access"
import { isFilterEnabled, isSectionVisible } from "@/lib/config/filters"
import { withFilterDefaults } from "@/lib/dashboard/filter-summary"
import type { FilterValue, Filters } from "@/lib/types"

export type FilterSectionId = "accounts" | "centers" | "prospects"

type Bounds = { min: number; max: number }

/** The data's own limits for each range filter; a range only counts as set once it moves inside them. */
export interface FilterRangeBounds {
  revenue: Bounds
  yearsInIndia: Bounds
  centerIncYear: Bounds
}

interface FieldCheck {
  /** The filter key gated by the filter config. */
  key: string
  isActive: (filters: Filters, bounds: FilterRangeBounds) => boolean
}

const values = (key: keyof Filters): FieldCheck => ({
  key,
  isActive: (filters) => (filters[key] as FilterValue[]).length > 0,
})

/** A range is set when it narrows the data's limits (a wider one, like an old saved default, isn't). */
export function isRangeActive(range: [number, number], bounds: Bounds, includeNull = true) {
  return range[0] > bounds.min || range[1] < bounds.max || !includeNull
}

/** Every filter field, by section, as the sidebar counts them: one per field, however many values it has. */
const SECTION_FIELDS: Record<FilterSectionId, FieldCheck[]> = {
  accounts: [
    values("accountGlobalLegalNameKeywords"),
    {
      key: "accountListValues",
      isActive: (f) => f.accountListValues.length > 0 || f.accountNameValues.length > 0,
    },
    {
      key: "accountHqRevenueRange",
      isActive: (f, b) => isRangeActive(f.accountHqRevenueRange, b.revenue, f.accountHqRevenueIncludeNull),
    },
    values("accountCenterEmployeesRangeValues"),
    {
      key: "accountYearsInIndiaRange",
      isActive: (f, b) => isRangeActive(f.accountYearsInIndiaRange, b.yearsInIndia, f.yearsInIndiaIncludeNull),
    },
    values("accountPrimaryCategoryValues"),
    values("accountHqCountryValues"),
    values("accountHqRegionValues"),
    values("accountHqEmployeeRangeValues"),
    values("accountHqIndustryValues"),
    values("accountPrimaryNatureValues"),
    values("accountNasscomStatusValues"),
    values("accountSourceValues"),
    values("accountTypeValues"),
    values("accountDataCoverageValues"),
  ],
  centers: [
    values("centerStatusValues"),
    values("centerTypeValues"),
    values("functionNameValues"),
    values("centerCityValues"),
    {
      key: "centerIncYearRange",
      isActive: (f, b) => isRangeActive(f.centerIncYearRange, b.centerIncYear, f.centerIncYearIncludeNull),
    },
    values("centerEmployeesRangeValues"),
    values("centerStateValues"),
    values("centerFocusValues"),
    values("techSoftwareInUseKeywords"),
    values("centerCountryValues"),
  ],
  prospects: [
    values("prospectTitleKeywords"),
    values("prospectHeadTypeValues"),
    values("prospectLevelValues"),
    values("prospectDepartmentValues"),
    values("prospectCityValues"),
    values("prospectEngagedValues"),
  ],
}

/** How many fields in a section are set (only fields the filter config enables). */
export function countActiveFields(section: FilterSectionId, filters: Filters, bounds: FilterRangeBounds) {
  return SECTION_FIELDS[section].filter((field) => isFilterEnabled(field.key) && field.isActive(filters, bounds)).length
}

const DEFAULT_VISIBILITY_MODE = "gcc"

/**
 * Filters set across the sidebar: one per field (however many values it has),
 * plus the "Accounts to show" switch when it isn't on GCCs. Used for the
 * sidebar total and for each saved filter's count, so the two always agree.
 */
export function countActiveFilters(source: Partial<Filters>, bounds: FilterRangeBounds) {
  // Saved filters can predate newer fields; fill those in before counting.
  const filters = withFilterDefaults(source)
  const sections = (Object.keys(SECTION_FIELDS) as FilterSectionId[]).filter(
    (section) => isSectionVisible(section) && isSectionEnabled(section)
  )
  const fields = sections.reduce((sum, section) => sum + countActiveFields(section, filters, bounds), 0)
  const visibility =
    isFilterEnabled("accountVisibilityMode") && (filters.accountVisibilityMode ?? DEFAULT_VISIBILITY_MODE) !== DEFAULT_VISIBILITY_MODE
  return fields + (visibility ? 1 : 0)
}
