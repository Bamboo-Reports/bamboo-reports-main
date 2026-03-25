import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  buildTrackedFiltersSnapshot,
  toTrackedFilterPlainValues,
  toTrackedFilterValueArray,
  toTrackedStringArray,
} from "@/lib/analytics/tracking"
import type { Account, Center, Function, Prospect, Service, Tech, Filters, AvailableOptions, FilterValue } from "@/lib/types"
import { isFilterEnabled } from "@/lib/config/filters"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import { calculateBaseRanges } from "@/lib/dashboard/ranges"
import {
  getAccountNames,
  getAvailableOptions,
  getDynamicRevenueRange,
  getFilteredData,
  type FilteredData,
  type RevenueRangeFilterState,
} from "@/lib/dashboard/filtering"
import { getAccountChartData, getCenterChartData, getProspectChartData } from "@/lib/dashboard/charts"

interface UseDashboardFiltersParams {
  accounts: Account[]
  centers: Center[]
  functions: Function[]
  services: Service[]
  prospects: Prospect[]
  tech: Tech[]
}

const isNumberRange = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number"

const serializeFilterValues = (values: FilterValue[]) =>
  values.map(({ value, mode }) => `${mode}:${value}`).sort()

export function useDashboardFilters({
  accounts,
  centers,
  functions,
  services,
  prospects,
  tech,
}: UseDashboardFiltersParams) {
  const baseRanges = useMemo(() => calculateBaseRanges(accounts, centers), [accounts, centers])

  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters())
  const [pendingFilters, setPendingFilters] = useState<Filters>(() => createDefaultFilters())
  const [isApplying, setIsApplying] = useState(false)

  const [revenueRange, setRevenueRange] = useState(baseRanges.revenueRange)
  const [yearsInIndiaRange, setYearsInIndiaRange] = useState(baseRanges.yearsInIndiaRange)
  const [centerIncYearRange, setCenterIncYearRange] = useState(baseRanges.centerIncYearRange)

  const isRevenueRangeAutoRef = useRef(true)
  const previousTrackedFiltersRef = useRef<Filters | null>(null)
  const filterTrackTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    isRevenueRangeAutoRef.current = true
    setRevenueRange(baseRanges.revenueRange)
    setYearsInIndiaRange(baseRanges.yearsInIndiaRange)
    setCenterIncYearRange(baseRanges.centerIncYearRange)

    const baseRevenue: [number, number] = [baseRanges.revenueRange.min, baseRanges.revenueRange.max]
    const baseYears: [number, number] = [baseRanges.yearsInIndiaRange.min, baseRanges.yearsInIndiaRange.max]
    const baseCenterInc: [number, number] = [baseRanges.centerIncYearRange.min, baseRanges.centerIncYearRange.max]

    setFilters((prev) => ({
      ...prev,
      accountHqRevenueRange: baseRevenue,
      accountYearsInIndiaRange: baseYears,
      centerIncYearRange: baseCenterInc,
    }))

    setPendingFilters((prev) => ({
      ...prev,
      accountHqRevenueRange: baseRevenue,
      accountYearsInIndiaRange: baseYears,
      centerIncYearRange: baseCenterInc,
    }))
  }, [baseRanges])

  useLayoutEffect(() => {
    setIsApplying(true)
    setFilters(pendingFilters)
    setIsApplying(false)
  }, [pendingFilters])

  const accountNames = useMemo(() => getAccountNames(accounts), [accounts])

  const filteredData: FilteredData = useMemo(
    () => getFilteredData(accounts, centers, functions, services, prospects, tech, filters),
    [accounts, centers, functions, services, prospects, tech, filters]
  )

  const accountChartData = useMemo(
    () => getAccountChartData(filteredData.filteredAccounts),
    [filteredData.filteredAccounts]
  )

  const centerChartData = useMemo(
    () => getCenterChartData(filteredData.filteredCenters, filteredData.filteredFunctions),
    [filteredData.filteredCenters, filteredData.filteredFunctions]
  )

  const prospectChartData = useMemo(
    () => getProspectChartData(filteredData.filteredProspects),
    [filteredData.filteredProspects]
  )

  const filterStateForRevenue: RevenueRangeFilterState = useMemo(
    () => ({
      accountHqRegionValues: filters.accountHqRegionValues,
      accountHqCountryValues: filters.accountHqCountryValues,
      accountHqIndustryValues: filters.accountHqIndustryValues,
      accountDataCoverageValues: filters.accountDataCoverageValues,
      accountSourceValues: filters.accountSourceValues,
      accountTypeValues: filters.accountTypeValues,
      accountPrimaryCategoryValues: filters.accountPrimaryCategoryValues,
      accountPrimaryNatureValues: filters.accountPrimaryNatureValues,
      accountNasscomStatusValues: filters.accountNasscomStatusValues,
      accountHqEmployeeRangeValues: filters.accountHqEmployeeRangeValues,
      accountCenterEmployeesRangeValues: filters.accountCenterEmployeesRangeValues,
      accountYearsInIndiaRange: filters.accountYearsInIndiaRange,
      yearsInIndiaIncludeNull: filters.yearsInIndiaIncludeNull,
    }),
    [
      filters.accountHqRegionValues,
      filters.accountHqCountryValues,
      filters.accountHqIndustryValues,
      filters.accountDataCoverageValues,
      filters.accountSourceValues,
      filters.accountTypeValues,
      filters.accountPrimaryCategoryValues,
      filters.accountPrimaryNatureValues,
      filters.accountNasscomStatusValues,
      filters.accountHqEmployeeRangeValues,
      filters.accountCenterEmployeesRangeValues,
      filters.accountYearsInIndiaRange,
      filters.yearsInIndiaIncludeNull,
    ]
  )

  const dynamicRevenueRange = useMemo(
    () => getDynamicRevenueRange(accounts, filterStateForRevenue),
    [accounts, filterStateForRevenue]
  )

  useEffect(() => {
    setRevenueRange(dynamicRevenueRange)

    setPendingFilters((prev) => {
      if (isRevenueRangeAutoRef.current) {
        if (
          prev.accountHqRevenueRange[0] !== dynamicRevenueRange.min ||
          prev.accountHqRevenueRange[1] !== dynamicRevenueRange.max
        ) {
          return {
            ...prev,
            accountHqRevenueRange: [dynamicRevenueRange.min, dynamicRevenueRange.max] as [number, number],
          }
        }

        return prev
      }

      const newMin = Math.max(prev.accountHqRevenueRange[0], dynamicRevenueRange.min)
      const newMax = Math.min(prev.accountHqRevenueRange[1], dynamicRevenueRange.max)

      if (newMin !== prev.accountHqRevenueRange[0] || newMax !== prev.accountHqRevenueRange[1]) {
        return {
          ...prev,
          accountHqRevenueRange: [newMin, newMax] as [number, number],
        }
      }

      return prev
    })
  }, [dynamicRevenueRange])

  const filterStateForOptions = useMemo(
    () => ({
      accountHqRegionValues: filters.accountHqRegionValues,
      accountHqCountryValues: filters.accountHqCountryValues,
      accountHqIndustryValues: filters.accountHqIndustryValues,
      accountDataCoverageValues: filters.accountDataCoverageValues,
      accountSourceValues: filters.accountSourceValues,
      accountTypeValues: filters.accountTypeValues,
      accountPrimaryCategoryValues: filters.accountPrimaryCategoryValues,
      accountPrimaryNatureValues: filters.accountPrimaryNatureValues,
      accountNasscomStatusValues: filters.accountNasscomStatusValues,
      accountHqEmployeeRangeValues: filters.accountHqEmployeeRangeValues,
      accountCenterEmployeesRangeValues: filters.accountCenterEmployeesRangeValues,
      accountYearsInIndiaRange: filters.accountYearsInIndiaRange,
      yearsInIndiaIncludeNull: filters.yearsInIndiaIncludeNull,
      centerTypeValues: filters.centerTypeValues,
      centerFocusValues: filters.centerFocusValues,
      centerCityValues: filters.centerCityValues,
      centerStateValues: filters.centerStateValues,
      centerCountryValues: filters.centerCountryValues,
      centerEmployeesRangeValues: filters.centerEmployeesRangeValues,
      centerStatusValues: filters.centerStatusValues,
      centerIncYearRange: filters.centerIncYearRange,
      centerIncYearIncludeNull: filters.centerIncYearIncludeNull,
      functionNameValues: filters.functionNameValues,
      techSoftwareInUseKeywords: filters.techSoftwareInUseKeywords,
      prospectDepartmentValues: filters.prospectDepartmentValues,
      prospectLevelValues: filters.prospectLevelValues,
      prospectCityValues: filters.prospectCityValues,
      prospectTitleKeywords: filters.prospectTitleKeywords,
      accountGlobalLegalNameKeywords: filters.accountGlobalLegalNameKeywords,
      accountHqRevenueRange: filters.accountHqRevenueRange,
      accountHqRevenueIncludeNull: filters.accountHqRevenueIncludeNull,
    }),
    [filters]
  )

  const availableOptions: AvailableOptions = useMemo(
    () => getAvailableOptions(accounts, centers, functions, prospects, tech, filterStateForOptions),
    [accounts, centers, functions, prospects, tech, filterStateForOptions]
  )

  const getActiveFilterCountFor = useCallback(
    (sourceFilters: Filters) => {
      let count = 0
      const e = isFilterEnabled

      // Multi-select filters: count selected values for enabled filters
      if (e("accountHqRegionValues")) count += sourceFilters.accountHqRegionValues.length
      if (e("accountHqCountryValues")) count += sourceFilters.accountHqCountryValues.length
      if (e("accountHqIndustryValues")) count += sourceFilters.accountHqIndustryValues.length
      if (e("accountDataCoverageValues")) count += sourceFilters.accountDataCoverageValues.length
      if (e("accountSourceValues")) count += sourceFilters.accountSourceValues.length
      if (e("accountTypeValues")) count += sourceFilters.accountTypeValues.length
      if (e("accountPrimaryCategoryValues")) count += sourceFilters.accountPrimaryCategoryValues.length
      if (e("accountPrimaryNatureValues")) count += sourceFilters.accountPrimaryNatureValues.length
      if (e("accountNasscomStatusValues")) count += sourceFilters.accountNasscomStatusValues.length
      if (e("accountHqEmployeeRangeValues")) count += sourceFilters.accountHqEmployeeRangeValues.length
      if (e("accountCenterEmployeesRangeValues")) count += sourceFilters.accountCenterEmployeesRangeValues.length
      if (e("accountGlobalLegalNameKeywords")) count += sourceFilters.accountGlobalLegalNameKeywords.length
      if (e("centerTypeValues")) count += sourceFilters.centerTypeValues.length
      if (e("centerFocusValues")) count += sourceFilters.centerFocusValues.length
      if (e("centerCityValues")) count += sourceFilters.centerCityValues.length
      if (e("centerStateValues")) count += sourceFilters.centerStateValues.length
      if (e("centerCountryValues")) count += sourceFilters.centerCountryValues.length
      if (e("centerEmployeesRangeValues")) count += sourceFilters.centerEmployeesRangeValues.length
      if (e("centerStatusValues")) count += sourceFilters.centerStatusValues.length
      if (e("functionNameValues")) count += sourceFilters.functionNameValues.length
      if (e("techSoftwareInUseKeywords")) count += sourceFilters.techSoftwareInUseKeywords.length
      if (e("prospectDepartmentValues")) count += sourceFilters.prospectDepartmentValues.length
      if (e("prospectLevelValues")) count += sourceFilters.prospectLevelValues.length
      if (e("prospectCityValues")) count += sourceFilters.prospectCityValues.length
      if (e("prospectTitleKeywords")) count += sourceFilters.prospectTitleKeywords.length

      // Range filters: count as 1 if range has been adjusted from default
      if (e("accountHqRevenueRange") && (
        sourceFilters.accountHqRevenueRange[0] !== revenueRange.min ||
        sourceFilters.accountHqRevenueRange[1] !== revenueRange.max
      )) count += 1
      if (e("accountYearsInIndiaRange") && (
        sourceFilters.accountYearsInIndiaRange[0] !== yearsInIndiaRange.min ||
        sourceFilters.accountYearsInIndiaRange[1] !== yearsInIndiaRange.max
      )) count += 1
      if (e("centerIncYearRange") && (
        sourceFilters.centerIncYearRange[0] !== centerIncYearRange.min ||
        sourceFilters.centerIncYearRange[1] !== centerIncYearRange.max
      )) count += 1

      // Boolean toggles: count as 1 if toggled on
      if (e("accountHqRevenueIncludeNull") && sourceFilters.accountHqRevenueIncludeNull) count += 1
      if (e("yearsInIndiaIncludeNull") && sourceFilters.yearsInIndiaIncludeNull) count += 1
      if (e("centerIncYearIncludeNull") && sourceFilters.centerIncYearIncludeNull) count += 1

      return count
    },
    [revenueRange, yearsInIndiaRange, centerIncYearRange]
  )

  const resetFilters = useCallback(() => {
    const previousActiveFiltersCount = getActiveFilterCountFor(filters)
    const emptyFilters = createDefaultFilters({
      accountHqRevenueRange: [baseRanges.revenueRange.min, baseRanges.revenueRange.max],
      accountYearsInIndiaRange: [baseRanges.yearsInIndiaRange.min, baseRanges.yearsInIndiaRange.max],
      centerIncYearRange: [baseRanges.centerIncYearRange.min, baseRanges.centerIncYearRange.max],
    })

    isRevenueRangeAutoRef.current = true
    setRevenueRange(baseRanges.revenueRange)
    setFilters(emptyFilters)
    setPendingFilters(emptyFilters)
    if (previousActiveFiltersCount > 0) {
      captureEvent(ANALYTICS_EVENTS.FILTERS_RESET, {
        previous_active_filters_count: previousActiveFiltersCount,
        previous_filters_snapshot: buildTrackedFiltersSnapshot(filters, {
          accountHqRevenueRange: [baseRanges.revenueRange.min, baseRanges.revenueRange.max],
          accountYearsInIndiaRange: [baseRanges.yearsInIndiaRange.min, baseRanges.yearsInIndiaRange.max],
          centerIncYearRange: [baseRanges.centerIncYearRange.min, baseRanges.centerIncYearRange.max],
        }),
        reset_to_filters_snapshot: buildTrackedFiltersSnapshot(emptyFilters, {
          accountHqRevenueRange: [baseRanges.revenueRange.min, baseRanges.revenueRange.max],
          accountYearsInIndiaRange: [baseRanges.yearsInIndiaRange.min, baseRanges.yearsInIndiaRange.max],
          centerIncYearRange: [baseRanges.centerIncYearRange.min, baseRanges.centerIncYearRange.max],
        }),
      })
    }
  }, [baseRanges, filters, getActiveFilterCountFor])

  const handleLoadSavedFilters = useCallback((savedFilters: Filters) => {
    isRevenueRangeAutoRef.current = false
    setPendingFilters(savedFilters)
    setFilters(savedFilters)
  }, [])

  const handleMinRevenueChange = useCallback(
    (value: string) => {
      const numValue = Number.parseFloat(value) || revenueRange.min
      const clampedValue = Math.max(revenueRange.min, Math.min(numValue, pendingFilters.accountHqRevenueRange[1]))
      isRevenueRangeAutoRef.current = false
      setPendingFilters((prev) => ({
        ...prev,
        accountHqRevenueRange: [clampedValue, prev.accountHqRevenueRange[1]],
      }))
    },
    [pendingFilters.accountHqRevenueRange, revenueRange]
  )

  const handleMaxRevenueChange = useCallback(
    (value: string) => {
      const numValue = Number.parseFloat(value) || revenueRange.max
      const clampedValue = Math.min(revenueRange.max, Math.max(numValue, pendingFilters.accountHqRevenueRange[0]))
      isRevenueRangeAutoRef.current = false
      setPendingFilters((prev) => ({
        ...prev,
        accountHqRevenueRange: [prev.accountHqRevenueRange[0], clampedValue],
      }))
    },
    [pendingFilters.accountHqRevenueRange, revenueRange]
  )

  const handleRevenueRangeChange = useCallback((value: [number, number]) => {
    isRevenueRangeAutoRef.current = false
    setPendingFilters((prev) => ({
      ...prev,
      accountHqRevenueRange: value,
    }))
  }, [])

  const handleMinYearsInIndiaChange = useCallback(
    (value: string) => {
      const numValue = Number.parseFloat(value) || yearsInIndiaRange.min
      const clampedValue = Math.max(yearsInIndiaRange.min, Math.min(numValue, pendingFilters.accountYearsInIndiaRange[1]))
      setPendingFilters((prev) => ({
        ...prev,
        accountYearsInIndiaRange: [clampedValue, prev.accountYearsInIndiaRange[1]],
      }))
    },
    [pendingFilters.accountYearsInIndiaRange, yearsInIndiaRange]
  )

  const handleMaxYearsInIndiaChange = useCallback(
    (value: string) => {
      const numValue = Number.parseFloat(value) || yearsInIndiaRange.max
      const clampedValue = Math.min(yearsInIndiaRange.max, Math.max(numValue, pendingFilters.accountYearsInIndiaRange[0]))
      setPendingFilters((prev) => ({
        ...prev,
        accountYearsInIndiaRange: [prev.accountYearsInIndiaRange[0], clampedValue],
      }))
    },
    [pendingFilters.accountYearsInIndiaRange, yearsInIndiaRange]
  )

  const handleYearsInIndiaRangeChange = useCallback((value: [number, number]) => {
    setPendingFilters((prev) => ({
      ...prev,
      accountYearsInIndiaRange: value,
    }))
  }, [])

  const handleMinCenterIncYearChange = useCallback(
    (value: string) => {
      if (value === "") return
      const numValue = Number.parseFloat(value)
      if (Number.isNaN(numValue)) return
      setPendingFilters((prev) => ({
        ...prev,
        centerIncYearRange: [numValue, prev.centerIncYearRange[1]],
      }))
    },
    []
  )

  const handleMaxCenterIncYearChange = useCallback(
    (value: string) => {
      if (value === "") return
      const numValue = Number.parseFloat(value)
      if (Number.isNaN(numValue)) return
      setPendingFilters((prev) => ({
        ...prev,
        centerIncYearRange: [prev.centerIncYearRange[0], numValue],
      }))
    },
    []
  )

  const handleCenterIncYearRangeChange = useCallback((value: [number, number]) => {
    setPendingFilters((prev) => ({
      ...prev,
      centerIncYearRange: value,
    }))
  }, [])

  const getTotalActiveFilters = useCallback(() => getActiveFilterCountFor(filters), [filters, getActiveFilterCountFor])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const previousFilters = previousTrackedFiltersRef.current
    if (!previousFilters) {
      previousTrackedFiltersRef.current = filters
      return
    }

    if (filterTrackTimeoutRef.current !== null) {
      window.clearTimeout(filterTrackTimeoutRef.current)
    }

    filterTrackTimeoutRef.current = window.setTimeout(() => {
      const previousActiveFiltersCount = getActiveFilterCountFor(previousFilters)
      const currentActiveFiltersCount = getActiveFilterCountFor(filters)

      if (previousActiveFiltersCount === 0 && currentActiveFiltersCount === 0) {
        previousTrackedFiltersRef.current = filters
        return
      }

      const filterKeys = Object.keys(filters) as Array<keyof Filters>

      for (const filterKey of filterKeys) {
        const previousValue = previousFilters[filterKey]
        const currentValue = filters[filterKey]

        if (JSON.stringify(previousValue) === JSON.stringify(currentValue)) {
          continue
        }

        if (isNumberRange(currentValue)) {
          const previousRange = isNumberRange(previousValue) ? previousValue : null
          captureEvent(ANALYTICS_EVENTS.FILTER_CHANGED, {
            filter_key: filterKey,
            change_type: "range_change",
            range_min: currentValue[0],
            range_max: currentValue[1],
            previous_range_min: previousRange ? previousRange[0] : null,
            previous_range_max: previousRange ? previousRange[1] : null,
            range_delta_min: previousRange ? currentValue[0] - previousRange[0] : null,
            range_delta_max: previousRange ? currentValue[1] - previousRange[1] : null,
            active_filters_count: currentActiveFiltersCount,
          })
          continue
        }

        if (typeof currentValue === "boolean") {
          captureEvent(ANALYTICS_EVENTS.FILTER_CHANGED, {
            filter_key: filterKey,
            change_type: "toggle",
            null_toggle_value: currentValue,
            previous_null_toggle_value: typeof previousValue === "boolean" ? previousValue : null,
            active_filters_count: currentActiveFiltersCount,
          })
          continue
        }

        if (!Array.isArray(currentValue)) {
          continue
        }

        const previousArray = (Array.isArray(previousValue) ? previousValue : []) as FilterValue[]
        const currentArray = currentValue as FilterValue[]
        const serializedPreviousValues = serializeFilterValues(previousArray)
        const serializedCurrentValues = serializeFilterValues(currentArray)
        const serializedPrevious = new Set(serializedPreviousValues)
        const serializedCurrent = new Set(serializedCurrentValues)

        let addedCount = 0
        let removedCount = 0
        const addedValues: string[] = []
        const removedValues: string[] = []

        for (const value of serializedCurrent) {
          if (!serializedPrevious.has(value)) {
            addedCount += 1
            addedValues.push(value)
          }
        }

        for (const value of serializedPrevious) {
          if (!serializedCurrent.has(value)) {
            removedCount += 1
            removedValues.push(value)
          }
        }

        const includeValues = currentArray
          .filter((item) => item.mode === "include")
          .map((item) => item.value)
        const excludeValues = currentArray
          .filter((item) => item.mode === "exclude")
          .map((item) => item.value)
        const previousIncludeValues = previousArray
          .filter((item) => item.mode === "include")
          .map((item) => item.value)
        const previousExcludeValues = previousArray
          .filter((item) => item.mode === "exclude")
          .map((item) => item.value)
        const includeCount = includeValues.length
        const excludeCount = excludeValues.length

        const changeType =
          currentArray.length === 0
            ? "clear"
            : addedCount >= removedCount
              ? "add"
              : "remove"

        captureEvent(ANALYTICS_EVENTS.FILTER_CHANGED, {
          filter_key: filterKey,
          change_type: changeType,
          include_count: includeCount,
          exclude_count: excludeCount,
          selected_count: currentArray.length,
          previous_selected_count: previousArray.length,
          added_count: addedCount,
          removed_count: removedCount,
          selected_values: toTrackedFilterPlainValues(currentArray),
          selected_values_with_mode: toTrackedFilterValueArray(currentArray),
          previous_selected_values: toTrackedFilterPlainValues(previousArray),
          previous_selected_values_with_mode: toTrackedFilterValueArray(previousArray),
          include_values: toTrackedStringArray(includeValues),
          exclude_values: toTrackedStringArray(excludeValues),
          previous_include_values: toTrackedStringArray(previousIncludeValues),
          previous_exclude_values: toTrackedStringArray(previousExcludeValues),
          added_values: toTrackedStringArray(addedValues),
          removed_values: toTrackedStringArray(removedValues),
          active_filters_count: currentActiveFiltersCount,
        })
      }

      previousTrackedFiltersRef.current = filters
    }, 350)

    return () => {
      if (filterTrackTimeoutRef.current !== null) {
        window.clearTimeout(filterTrackTimeoutRef.current)
      }
    }
  }, [filters, getActiveFilterCountFor])

  return {
    filters,
    pendingFilters,
    setPendingFilters,
    isApplying,
    revenueRange,
    yearsInIndiaRange,
    centerIncYearRange,
    accountNames,
    availableOptions,
    filteredData,
    accountChartData,
    centerChartData,
    prospectChartData,
    resetFilters,
    handleLoadSavedFilters,
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
  }
}
