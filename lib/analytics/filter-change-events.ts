import { getFilterMetadataProperties } from "@/lib/analytics/filter-metadata"
import {
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
  toTrackedStringArray,
} from "@/lib/analytics/tracking"
import type { Filters, FilterValue } from "@/lib/types"

const isNumberRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number"

const serializeFilterValues = (values: FilterValue[]) => values.map(({ value, mode }) => `${mode}:${value}`).sort()

const valuesWithMode = (values: FilterValue[], mode: FilterValue["mode"]) =>
  values.filter((item) => item.mode === mode).map((item) => item.value)

/**
 * The filter_changed event properties for every filter that differs between
 * `previous` and `current`, in filter order. Ranges, toggles, single selects
 * and multi-selects each describe their change in their own terms.
 */
export function buildFilterChangedEvents(
  previous: Filters,
  current: Filters,
  activeFiltersCount: number
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = []

  for (const filterKey of Object.keys(current) as Array<keyof Filters>) {
    const previousValue = previous[filterKey]
    const currentValue = current[filterKey]
    if (JSON.stringify(previousValue) === JSON.stringify(currentValue)) continue

    const base = { filter_key: filterKey, ...getFilterMetadataProperties(filterKey) }

    if (isNumberRange(currentValue)) {
      const previousRange = isNumberRange(previousValue) ? previousValue : null
      events.push({
        ...base,
        change_type: "range_change",
        range_min: currentValue[0],
        range_max: currentValue[1],
        previous_range_min: previousRange ? previousRange[0] : null,
        previous_range_max: previousRange ? previousRange[1] : null,
        range_delta_min: previousRange ? currentValue[0] - previousRange[0] : null,
        range_delta_max: previousRange ? currentValue[1] - previousRange[1] : null,
        active_filters_count: activeFiltersCount,
      })
      continue
    }

    if (typeof currentValue === "boolean") {
      events.push({
        ...base,
        change_type: "toggle",
        null_toggle_value: currentValue,
        previous_null_toggle_value: typeof previousValue === "boolean" ? previousValue : null,
        active_filters_count: activeFiltersCount,
      })
      continue
    }

    if (typeof currentValue === "string") {
      events.push({
        ...base,
        change_type: "select",
        selected_value: currentValue,
        previous_selected_value: typeof previousValue === "string" ? previousValue : null,
        active_filters_count: activeFiltersCount,
      })
      continue
    }

    if (!Array.isArray(currentValue)) continue

    const previousArray = (Array.isArray(previousValue) ? previousValue : []) as FilterValue[]
    const currentArray = currentValue as FilterValue[]
    const serializedPrevious = new Set(serializeFilterValues(previousArray))
    const serializedCurrent = new Set(serializeFilterValues(currentArray))
    const addedValues = [...serializedCurrent].filter((value) => !serializedPrevious.has(value))
    const removedValues = [...serializedPrevious].filter((value) => !serializedCurrent.has(value))
    const includeValues = valuesWithMode(currentArray, "include")
    const excludeValues = valuesWithMode(currentArray, "exclude")

    events.push({
      ...base,
      change_type: currentArray.length === 0 ? "clear" : addedValues.length >= removedValues.length ? "add" : "remove",
      include_count: includeValues.length,
      exclude_count: excludeValues.length,
      selected_count: currentArray.length,
      previous_selected_count: previousArray.length,
      added_count: addedValues.length,
      removed_count: removedValues.length,
      selected_values: toTrackedFilterPlainValues(currentArray),
      selected_values_with_mode: toTrackedFilterValueArray(currentArray),
      previous_selected_values: toTrackedFilterPlainValues(previousArray),
      previous_selected_values_with_mode: toTrackedFilterValueArray(previousArray),
      include_values: toTrackedStringArray(includeValues),
      exclude_values: toTrackedStringArray(excludeValues),
      previous_include_values: toTrackedStringArray(valuesWithMode(previousArray, "include")),
      previous_exclude_values: toTrackedStringArray(valuesWithMode(previousArray, "exclude")),
      added_values: toTrackedStringArray(addedValues),
      removed_values: toTrackedStringArray(removedValues),
      active_filters_count: activeFiltersCount,
    })
  }

  return events
}
