import { isRangeActive, type FilterRangeBounds, type FilterSectionId } from "@/components/filters/filter-fields"
import { formatRangeSummary, type RangeUnit } from "@/components/filters/filter-range-field"
import { isSectionEnabled } from "@/lib/config/dashboard-access"
import { isFilterEnabled, isSectionVisible } from "@/lib/config/filters"
import { withFilterDefaults } from "@/lib/dashboard/filter-summary"
import type { AccountVisibilityMode, FilterValue, Filters } from "@/lib/types"

/** One set filter: its values (with include/exclude), or a single line of text for ranges and switches. */
export interface DescribedField {
  label: string
  values?: FilterValue[]
  text?: string
}

export interface DescribedSection {
  section: FilterSectionId
  fields: DescribedField[]
}

const VISIBILITY_LABELS: Record<AccountVisibilityMode, string> = { all: "All", gcc: "GCCs", nonGcc: "Non-GCCs" }

type FieldSpec =
  | { kind: "values"; key: keyof Filters; label: string }
  | {
      kind: "range"
      key: "accountHqRevenueRange" | "accountYearsInIndiaRange" | "centerIncYearRange"
      includeNullKey: "accountHqRevenueIncludeNull" | "yearsInIndiaIncludeNull" | "centerIncYearIncludeNull"
      bounds: keyof FilterRangeBounds
      unit: RangeUnit
      label: string
    }
  | { kind: "accountList"; label: string }

// The sidebar's fields, in its order and with its labels.
const SECTION_SPECS: Record<FilterSectionId, FieldSpec[]> = {
  accounts: [
    { kind: "values", key: "accountGlobalLegalNameKeywords", label: "Account name" },
    { kind: "accountList", label: "Account list" },
    { kind: "range", key: "accountHqRevenueRange", includeNullKey: "accountHqRevenueIncludeNull", bounds: "revenue", unit: "money", label: "HQ revenue" },
    { kind: "values", key: "accountCenterEmployeesRangeValues", label: "GCC headcount (India)" },
    { kind: "range", key: "accountYearsInIndiaRange", includeNullKey: "yearsInIndiaIncludeNull", bounds: "yearsInIndia", unit: "years", label: "Years in India" },
    { kind: "values", key: "accountPrimaryCategoryValues", label: "Industry" },
    { kind: "values", key: "accountHqCountryValues", label: "HQ country" },
    { kind: "values", key: "accountHqRegionValues", label: "HQ region" },
    { kind: "values", key: "accountHqEmployeeRangeValues", label: "HQ employee range" },
    { kind: "values", key: "accountHqIndustryValues", label: "Sub industry" },
    { kind: "values", key: "accountPrimaryNatureValues", label: "Segment" },
    { kind: "values", key: "accountNasscomStatusValues", label: "NASSCOM listing" },
    { kind: "values", key: "accountSourceValues", label: "Source" },
    { kind: "values", key: "accountTypeValues", label: "Type" },
    { kind: "values", key: "accountDataCoverageValues", label: "Coverage" },
  ],
  centers: [
    { kind: "values", key: "centerStatusValues", label: "Status" },
    { kind: "values", key: "centerTypeValues", label: "Centre type" },
    { kind: "values", key: "functionNameValues", label: "Services offered" },
    { kind: "values", key: "centerCityValues", label: "City" },
    { kind: "range", key: "centerIncYearRange", includeNullKey: "centerIncYearIncludeNull", bounds: "centerIncYear", unit: "year", label: "Incorporation year" },
    { kind: "values", key: "centerEmployeesRangeValues", label: "Centre headcount" },
    { kind: "values", key: "centerStateValues", label: "State" },
    { kind: "values", key: "centerFocusValues", label: "Centre focus" },
    { kind: "values", key: "techSoftwareInUseKeywords", label: "Software in use" },
    { kind: "values", key: "centerCountryValues", label: "Country" },
  ],
  prospects: [
    { kind: "values", key: "prospectTitleKeywords", label: "Job title" },
    { kind: "values", key: "prospectHeadTypeValues", label: "Role" },
    { kind: "values", key: "prospectLevelValues", label: "Seniority level" },
    { kind: "values", key: "prospectDepartmentValues", label: "Department" },
    { kind: "values", key: "prospectCityValues", label: "City" },
    { kind: "values", key: "prospectEngagedValues", label: "Engaged" },
  ],
}

/**
 * What a set of filters selects, grouped like the sidebar. Only set fields are
 * listed, the same ones countActiveFilters counts. listNames maps account list
 * ids to their names.
 */
export function describeFilters(
  source: Partial<Filters>,
  bounds: FilterRangeBounds,
  listNames: ReadonlyMap<string, string>
): DescribedSection[] {
  const filters = withFilterDefaults(source)
  const out: DescribedSection[] = []

  for (const section of Object.keys(SECTION_SPECS) as FilterSectionId[]) {
    if (!isSectionVisible(section) || !isSectionEnabled(section)) continue
    const fields: DescribedField[] = []

    if (section === "accounts" && isFilterEnabled("accountVisibilityMode") && filters.accountVisibilityMode !== "gcc") {
      fields.push({ label: "Accounts to show", text: VISIBILITY_LABELS[filters.accountVisibilityMode] })
    }

    for (const spec of SECTION_SPECS[section]) {
      if (spec.kind === "values") {
        if (!isFilterEnabled(spec.key)) continue
        const values = filters[spec.key] as FilterValue[]
        if (values.length > 0) fields.push({ label: spec.label, values })
      } else if (spec.kind === "range") {
        if (!isFilterEnabled(spec.key)) continue
        const includeNull = !isFilterEnabled(spec.includeNullKey) || filters[spec.includeNullKey]
        const range = filters[spec.key]
        if (isRangeActive(range, bounds[spec.bounds], includeNull)) {
          fields.push({ label: spec.label, text: formatRangeSummary(range, bounds[spec.bounds], includeNull, spec.unit) })
        }
      } else {
        if (!isFilterEnabled("accountListValues")) continue
        if (filters.accountListValues.length > 0) {
          fields.push({
            label: spec.label,
            values: filters.accountListValues.map((item) => ({ ...item, value: listNames.get(item.value) ?? "Unavailable list" })),
          })
        } else if (filters.accountNameValues.length > 0) {
          const n = filters.accountNameValues.length
          fields.push({ label: spec.label, text: `${n.toLocaleString()} ${n === 1 ? "account" : "accounts"}` })
        }
      }
    }

    if (fields.length > 0) out.push({ section, fields })
  }
  return out
}
