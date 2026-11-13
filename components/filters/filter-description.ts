import { isRangeActive, type FilterRangeBounds, type FilterSectionId } from "@/lib/dashboard/active-filters"
import { formatRangeSummary } from "@/components/filters/filter-range-field"
import { SECTION_LABELS, SECTION_SPECS, VISIBILITY_FIELD_LABEL } from "@/lib/dashboard/filter-spec"
import { withFilterDefaults } from "@/lib/dashboard/filter-summary"
import type { AccountVisibilityMode, FilterValue, Filters } from "@/lib/types"

/** One set filter: its values (with include/exclude), or a single line of text for ranges and switches. */
export interface DescribedField {
  label: string
  values?: FilterValue[]
  text?: string
  /** Unique among the fields of one description (section and filter key); set by describeFilterFields. */
  key?: string
}

export interface DescribedSection {
  section: FilterSectionId
  fields: DescribedField[]
}

const VISIBILITY_LABELS: Record<AccountVisibilityMode, string> = { all: "All", gcc: "GCCs", nonGcc: "Non-GCCs" }

/**
 * What a set of filters selects, grouped like the sidebar. Only set fields are
 * listed, the same ones countActiveFilters counts. listNames maps account list
 * ids to their names.
 */
export function describeFilters(
  // accountNameCount: the full number of names when the list was shortened (the exports list does this).
  source: Partial<Filters> & { accountNameCount?: number },
  bounds: FilterRangeBounds,
  listNames: ReadonlyMap<string, string>
): DescribedSection[] {
  const filters = withFilterDefaults(source)
  const out: DescribedSection[] = []

  for (const section of Object.keys(SECTION_SPECS) as FilterSectionId[]) {
    const fields: DescribedField[] = []

    if (section === "accounts" && filters.accountVisibilityMode !== "gcc") {
      fields.push({ label: VISIBILITY_FIELD_LABEL, text: VISIBILITY_LABELS[filters.accountVisibilityMode] })
    }

    for (const spec of SECTION_SPECS[section]) {
      if (spec.kind === "values") {
        const values = filters[spec.key] as FilterValue[]
        if (values.length > 0) fields.push({ label: spec.label, values })
      } else if (spec.kind === "range") {
        const includeNull = filters[spec.includeNullKey]
        const range = filters[spec.key]
        if (isRangeActive(range, bounds[spec.bounds], includeNull)) {
          fields.push({ label: spec.label, text: formatRangeSummary(range, bounds[spec.bounds], includeNull, spec.unit) })
        }
      } else {
        if (filters.accountListValues.length > 0) {
          fields.push({
            label: spec.label,
            values: filters.accountListValues.map((item) => ({ ...item, value: listNames.get(item.value) ?? "Unavailable list" })),
          })
        } else if (filters.accountNameValues.length > 0) {
          const n = source.accountNameCount ?? filters.accountNameValues.length
          fields.push({ label: spec.label, text: `${n.toLocaleString()} ${n === 1 ? "account" : "accounts"}` })
        }
      }
    }

    if (fields.length > 0) out.push({ section, fields })
  }
  return out
}

/** A described field as one line: "Bengaluru, not Pune" for values; the text as is for ranges and switches. */
export function fieldText(field: DescribedField): string {
  if (field.text) return field.text
  return (field.values ?? []).map((v) => (v.mode === "exclude" ? `not ${v.value}` : v.value)).join(", ")
}

/**
 * The described fields of every section as one flat list for chips, each with
 * a unique key. A label two sections share ("City" for centres and prospects)
 * gets the section after it so the chips can be told apart.
 */
export function describeFilterFields(
  source: Partial<Filters>,
  bounds: FilterRangeBounds,
  listNames: ReadonlyMap<string, string>
): DescribedField[] {
  const sections = describeFilters(source, bounds, listNames)
  const labelCounts = new Map<string, number>()
  for (const { fields } of sections) {
    for (const field of fields) labelCounts.set(field.label, (labelCounts.get(field.label) ?? 0) + 1)
  }
  return sections.flatMap(({ section, fields }) =>
    fields.map((field) => ({
      ...field,
      key: `${section}:${field.label}`,
      label: (labelCounts.get(field.label) ?? 0) > 1 ? `${field.label} (${SECTION_LABELS[section].toLowerCase()})` : field.label,
    }))
  )
}
