import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { buildTrackedFiltersSnapshot } from "@/lib/analytics/tracking"
import type { Account, Center, Function, Prospect, Service, Tech, Filters, AvailableOptions } from "@/lib/types"
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
import { perfLog } from "@/lib/utils/dev-log"
import { countActiveFilters, type FilterRangeBounds } from "@/lib/dashboard/active-filters"
import { useAccountLists } from "@/contexts/account-lists-context"
import { expandAccountLists } from "@/lib/accounts/account-lists"
import { useFilterChangeTracking } from "@/hooks/use-filter-change-tracking"

// Returns the filter keys whose values differ between two filter objects.
function changedFilterKeys(prev: Filters, next: Filters): string[] {
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if ((prev as unknown as Record<string, unknown>)[key] !== (next as unknown as Record<string, unknown>)[key]) {
      changed.push(key)
    }
  }
  return changed
}

interface UseDashboardFiltersParams {
  accounts: Account[]
  centers: Center[]
  functions: Function[]
  services: Service[]
  prospects: Prospect[]
  tech: Tech[]
  /**
   * Server mode (#249): base slider ranges come from the facets endpoint
   * instead of the (absent) client data, and the dynamic revenue-range
   * narrowing is skipped since it needs the full accounts array.
   */
  serverRanges?: {
    revenue: { min: number; max: number }
    yearsInIndia: { min: number; max: number }
    centerIncYear: { min: number; max: number }
  } | null
}

/** Pull a [min, max] range inside the data's bounds (a reversed range falls back to the full range). */
export function clampRange(range: [number, number], bounds: { min: number; max: number }): [number, number] {
  const low = Math.min(Math.max(range[0], bounds.min), bounds.max)
  const high = Math.max(Math.min(range[1], bounds.max), bounds.min)
  return low <= high ? [low, high] : [bounds.min, bounds.max]
}

export function useDashboardFilters({
  accounts,
  centers,
  functions,
  services,
  prospects,
  tech,
  serverRanges,
}: UseDashboardFiltersParams) {
  const { lists: accountLists } = useAccountLists()
  const baseRanges = useMemo(
    () =>
      serverRanges
        ? {
            revenueRange: serverRanges.revenue,
            yearsInIndiaRange: serverRanges.yearsInIndia,
            centerIncYearRange: serverRanges.centerIncYear,
          }
        : calculateBaseRanges(accounts, centers),
    [serverRanges, accounts, centers]
  )

  // Start the ranges at the current bounds, so the filters never disagree with
  // the bounds they are measured against (the effect below keeps them in step).
  const initialFilters = () =>
    createDefaultFilters({
      accountHqRevenueRange: [baseRanges.revenueRange.min, baseRanges.revenueRange.max],
      accountYearsInIndiaRange: [baseRanges.yearsInIndiaRange.min, baseRanges.yearsInIndiaRange.max],
      centerIncYearRange: [baseRanges.centerIncYearRange.min, baseRanges.centerIncYearRange.max],
    })
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [pendingFilters, setPendingFilters] = useState<Filters>(initialFilters)
  const [isApplying, startApplyTransition] = useTransition()

  const [revenueRange, setRevenueRange] = useState(baseRanges.revenueRange)
  const [yearsInIndiaRange, setYearsInIndiaRange] = useState(baseRanges.yearsInIndiaRange)
  const [centerIncYearRange, setCenterIncYearRange] = useState(baseRanges.centerIncYearRange)

  const isRevenueRangeAutoRef = useRef(true)
  const previousBaseRangesRef = useRef(baseRanges)
  // The limits in place before the data's own arrived (the first ones seen).
  const placeholderRangesRef = useRef(baseRanges)

  // Interaction timing instrumentation (dev only).
  const applyStartRef = useRef<number | null>(null)
  const applyLabelRef = useRef<string>("")
  const prevPendingFiltersRef = useRef<Filters>(pendingFilters)

  useEffect(() => {
    setRevenueRange(baseRanges.revenueRange)
    setYearsInIndiaRange(baseRanges.yearsInIndiaRange)
    setCenterIncYearRange(baseRanges.centerIncYearRange)

    // A range left at the old limits moves to the new ones. A narrowed range
    // (from a link or a saved filter applied before the limits arrived) is
    // kept, pulled inside the new limits.
    const previous = previousBaseRangesRef.current
    previousBaseRangesRef.current = baseRanges
    // An unchanged range keeps its array (and unchanged filters their object),
    // so nothing downstream sees a change where there is none.
    // Before the data's limits arrive the placeholder stands in for them, and
    // only a range that is exactly the placeholder counts as left alone: a
    // link may carry a range wider than the placeholder, which must be kept.
    const untouched = (value: [number, number], before: { min: number; max: number }) =>
      previous === placeholderRangesRef.current
        ? value[0] === before.min && value[1] === before.max
        : value[0] <= before.min && value[1] >= before.max
    const follow = (value: [number, number], before: { min: number; max: number }, now: { min: number; max: number }): [number, number] => {
      const next = untouched(value, before) ? ([now.min, now.max] as [number, number]) : clampRange(value, now)
      return next[0] === value[0] && next[1] === value[1] ? value : next
    }
    const withNewLimits = (prev: Filters): Filters => {
      const revenue = follow(prev.accountHqRevenueRange, previous.revenueRange, baseRanges.revenueRange)
      const years = follow(prev.accountYearsInIndiaRange, previous.yearsInIndiaRange, baseRanges.yearsInIndiaRange)
      const incYear = follow(prev.centerIncYearRange, previous.centerIncYearRange, baseRanges.centerIncYearRange)
      if (revenue === prev.accountHqRevenueRange && years === prev.accountYearsInIndiaRange && incYear === prev.centerIncYearRange) return prev
      return { ...prev, accountHqRevenueRange: revenue, accountYearsInIndiaRange: years, centerIncYearRange: incYear }
    }

    setFilters(withNewLimits)
    setPendingFilters((prev) => {
      // The revenue range goes back to following the data only while nobody
      // has narrowed it. Read from the filters being updated, so a filter
      // loaded in the same batch as new limits is seen.
      isRevenueRangeAutoRef.current = untouched(prev.accountHqRevenueRange, previous.revenueRange)
      return withNewLimits(prev)
    })
  }, [baseRanges])

  useEffect(() => {
    const changed = changedFilterKeys(prevPendingFiltersRef.current, pendingFilters)
    prevPendingFiltersRef.current = pendingFilters
    if (changed.length > 0) {
      applyLabelRef.current = changed.join(", ")
      applyStartRef.current = performance.now()
    }
    startApplyTransition(() => {
      setFilters(pendingFilters)
    })
  }, [pendingFilters])

  const accountNames = useMemo(() => getAccountNames(accounts), [accounts])

  const filteredData: FilteredData = useMemo(
    () => {
      const start = performance.now()
      const result = getFilteredData(accounts, centers, functions, services, prospects, tech, filters)
      perfLog("getFilteredData recompute", performance.now() - start)
      return result
    },
    [accounts, centers, functions, services, prospects, tech, filters]
  )

  // Logs total perceived latency from a filter change to the painted update (dev only).
  useEffect(() => {
    if (applyStartRef.current == null) return
    const start = applyStartRef.current
    const label = applyLabelRef.current
    applyStartRef.current = null
    const raf = requestAnimationFrame(() => {
      perfLog(`apply [${label}] reflected in UI`, performance.now() - start)
    })
    return () => cancelAnimationFrame(raf)
  }, [filteredData])

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
      accountVisibilityMode: filters.accountVisibilityMode,
      accountHqCountryValues: filters.accountHqCountryValues,
      accountHqIndustryValues: filters.accountHqIndustryValues,
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
      filters.accountVisibilityMode,
      filters.accountHqCountryValues,
      filters.accountHqIndustryValues,
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
    () => (serverRanges ? serverRanges.revenue : getDynamicRevenueRange(accounts, filterStateForRevenue)),
    [serverRanges, accounts, filterStateForRevenue]
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
      accountVisibilityMode: filters.accountVisibilityMode,
      accountHqCountryValues: filters.accountHqCountryValues,
      accountHqIndustryValues: filters.accountHqIndustryValues,
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
      centerEmployeesRangeValues: filters.centerEmployeesRangeValues,
      centerStatusValues: filters.centerStatusValues,
      centerIncYearRange: filters.centerIncYearRange,
      centerIncYearIncludeNull: filters.centerIncYearIncludeNull,
      functionNameValues: filters.functionNameValues,
      techSoftwareInUseKeywords: filters.techSoftwareInUseKeywords,
      prospectDepartmentValues: filters.prospectDepartmentValues,
      prospectHeadTypeValues: filters.prospectHeadTypeValues,
      prospectLevelValues: filters.prospectLevelValues,
      prospectEngagedValues: filters.prospectEngagedValues,
      prospectCityValues: filters.prospectCityValues,
      prospectTitleKeywords: filters.prospectTitleKeywords,
      accountGlobalLegalNameKeywords: filters.accountGlobalLegalNameKeywords,
      accountNameValues: filters.accountNameValues,
      accountListValues: filters.accountListValues,
      accountHqRevenueRange: filters.accountHqRevenueRange,
      accountHqRevenueIncludeNull: filters.accountHqRevenueIncludeNull,
    }),
    [filters]
  )

  const availableOptions: AvailableOptions = useMemo(
    () => {
      const start = performance.now()
      const result = getAvailableOptions(accounts, centers, functions, prospects, tech, filterStateForOptions as Filters)
      perfLog("getAvailableOptions recompute", performance.now() - start)
      return result
    },
    [accounts, centers, functions, prospects, tech, filterStateForOptions]
  )

  // The full extent of each range slider: a range at these bounds is not a filter.
  const rangeBaselines: FilterRangeBounds = useMemo(
    () => ({ revenue: revenueRange, yearsInIndia: yearsInIndiaRange, centerIncYear: centerIncYearRange }),
    [revenueRange, yearsInIndiaRange, centerIncYearRange]
  )

  const getActiveFilterCountFor = useCallback(
    (sourceFilters: Filters) => countActiveFilters(sourceFilters, rangeBaselines),
    [rangeBaselines]
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

  const handleLoadSavedFilters = useCallback((savedFilters: Filters, options: { clampRanges?: boolean } = {}) => {
    const clamp = options.clampRanges !== false
      ? clampRange
      : (range: [number, number]) => range
    // Re-derive exact names from the current account lists so edits to a list
    // reach saved filters that reference it.
    const expanded = expandAccountLists(savedFilters, accountLists)
    // A filter saved against older data can carry range bounds outside today's
    // data (and its slider); pull them back inside so the inputs and slider agree.
    const sanitizedSavedFilters: Filters = {
      ...expanded,
      accountHqRevenueRange: clamp(expanded.accountHqRevenueRange, baseRanges.revenueRange),
      accountYearsInIndiaRange: clamp(expanded.accountYearsInIndiaRange, baseRanges.yearsInIndiaRange),
      centerIncYearRange: clamp(expanded.centerIncYearRange, baseRanges.centerIncYearRange),
    }
    isRevenueRangeAutoRef.current = false
    setPendingFilters(sanitizedSavedFilters)
    setFilters(sanitizedSavedFilters)
  }, [accountLists, baseRanges])

  const handleRevenueRangeChange = useCallback((value: [number, number]) => {
    isRevenueRangeAutoRef.current = false
    setPendingFilters((prev) => ({
      ...prev,
      accountHqRevenueRange: value,
    }))
  }, [])

  const handleYearsInIndiaRangeChange = useCallback((value: [number, number]) => {
    setPendingFilters((prev) => ({
      ...prev,
      accountYearsInIndiaRange: value,
    }))
  }, [])

  const handleCenterIncYearRangeChange = useCallback((value: [number, number]) => {
    setPendingFilters((prev) => ({
      ...prev,
      centerIncYearRange: value,
    }))
  }, [])

  const getTotalActiveFilters = useCallback(() => getActiveFilterCountFor(filters), [filters, getActiveFilterCountFor])

  useFilterChangeTracking(filters, rangeBaselines)

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
    handleRevenueRangeChange,
    handleYearsInIndiaRangeChange,
    handleCenterIncYearRangeChange,
    getTotalActiveFilters,
  }
}
