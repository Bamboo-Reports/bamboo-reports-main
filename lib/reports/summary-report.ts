import type { AccountVisibilityMode, ChartData, Filters, FilterValue } from "@/lib/types"
import { FILTER_METADATA } from "@/lib/analytics/filter-metadata"
import { formatRevenueInMillions } from "@/lib/utils/helpers"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"

/**
 * Builds the data model behind the downloadable summary PDF: the headline
 * counts shown in the dashboard summary cards plus a human-readable list of
 * every filter that produced them. Pure and framework-free so it can be unit
 * tested; rendering lives in summary-report-pdf.ts.
 */

export type ReportSection = "accounts" | "centers" | "prospects"

export interface ReportMetric {
  id: "accounts" | "centers" | "upcomingCenters" | "prospects" | "headcount"
  label: string
  description: string
  filtered: number
  total: number
}

export type ReportFilterGroup = "Scope" | "Account" | "Center" | "Prospect"

export interface ReportFilterRow {
  group: ReportFilterGroup
  label: string
  /** Included values, or the single formatted value for ranges / modes. */
  included: string[]
  excluded: string[]
}

export interface ReportChartSegment {
  name: string
  value: number
  /** Percent of the chart total, to one decimal place. */
  percent: number
  color: string
}

export interface ReportChartOtherMember {
  name: string
  value: number
  /** Share of the chart total, to one decimal place. */
  percent: number
}

export interface ReportChart {
  title: string
  countLabel: string
  total: number
  segments: ReportChartSegment[]
  /** Categories folded into the Others bar, largest first. */
  othersMembers: ReportChartOtherMember[]
}

export interface ReportChartGroup {
  section: ReportSection
  title: string
  /** Records matching the filters and the full database count, as in Key metrics. */
  matching: number
  databaseTotal: number
  charts: ReportChart[]
}

export interface SummaryReportModel {
  title: string
  productName: string
  generatedAt: Date
  generatedBy?: string
  activeView: ReportSection
  activeFilterCount: number
  metrics: ReportMetric[]
  filters: ReportFilterRow[]
  chartGroups: ReportChartGroup[]
}

export interface SummaryReportChartSources {
  accounts: {
    regionData: ChartData[]
    primaryNatureData: ChartData[]
    revenueRangeData: ChartData[]
    employeesRangeData: ChartData[]
  }
  centers: {
    centerTypeData: ChartData[]
    employeesRangeData: ChartData[]
    cityData: ChartData[]
    functionData: ChartData[]
  }
  prospects: {
    departmentData: ChartData[]
    levelData: ChartData[]
  }
}

export interface SummaryReportCounts {
  filteredAccountsCount: number
  totalAccountsCount: number
  filteredCentersCount: number
  totalCentersCount: number
  filteredUpcomingCentersCount: number
  totalUpcomingCentersCount: number
  filteredProspectsCount: number
  totalProspectsCount: number
  filteredHeadcount: number
  totalHeadcount: number
}

export interface SummaryReportRange {
  min: number
  max: number
}

export interface BuildSummaryReportInput {
  filters: Filters
  counts: SummaryReportCounts
  /** Full data extents; a range filter is active only when it differs from these. */
  baselineRanges: {
    revenue: SummaryReportRange
    yearsInIndia: SummaryReportRange
    centerIncYear: SummaryReportRange
  }
  enabledSections: Record<ReportSection, boolean>
  activeView: ReportSection
  activeFilterCount: number
  /** Chart data as shown on the dashboard tabs; omitted charts are skipped. */
  charts?: SummaryReportChartSources
  generatedBy?: string
  generatedAt?: Date
}

const GROUP_LABEL: Record<"account" | "center" | "prospect", ReportFilterGroup> = {
  account: "Account",
  center: "Center",
  prospect: "Prospect",
}

const VISIBILITY_LABEL: Record<AccountVisibilityMode, string> = {
  all: "All accounts (GCC and non-GCC)",
  gcc: "GCC accounts only",
  nonGcc: "Non-GCC accounts only",
}

// Keys rendered as value lists, in the order they appear in the sidebar.
const LIST_FILTER_KEYS = [
  "accountGlobalLegalNameKeywords",
  "accountHqRegionValues",
  "accountHqCountryValues",
  "accountPrimaryCategoryValues",
  "accountHqIndustryValues",
  "accountPrimaryNatureValues",
  "accountTypeValues",
  "accountSourceValues",
  "accountDataCoverageValues",
  "accountNasscomStatusValues",
  "accountHqEmployeeRangeValues",
  "accountCenterEmployeesRangeValues",
  "centerTypeValues",
  "centerFocusValues",
  "centerStatusValues",
  "centerCountryValues",
  "centerStateValues",
  "centerCityValues",
  "centerEmployeesRangeValues",
  "functionNameValues",
  "techSoftwareInUseKeywords",
  "prospectDepartmentValues",
  "prospectHeadTypeValues",
  "prospectLevelValues",
  "prospectCityValues",
  "prospectTitleKeywords",
] as const satisfies ReadonlyArray<keyof Filters>

type ListFilterKey = (typeof LIST_FILTER_KEYS)[number]

const splitByMode = (values: FilterValue[]) => {
  const included: string[] = []
  const excluded: string[] = []
  for (const item of values) {
    if (!item?.value) continue
    if (item.mode === "exclude") excluded.push(item.value)
    else included.push(item.value)
  }
  return { included, excluded }
}

const isRangeActive = (range: [number, number], baseline: SummaryReportRange) =>
  range[0] !== baseline.min || range[1] !== baseline.max

// Range filters carry a toggle for records with no value in that field. The
// note lands in the included or excluded column so the colouring tells the
// story without extra prose.
const blankValueNote = (noun: string) => `${noun} with no recorded value`

const rangeRow = (params: {
  group: ReportFilterGroup
  label: string
  value: string
  includeNull: boolean
  noun: string
}): ReportFilterRow => ({
  group: params.group,
  label: params.label,
  included: params.includeNull ? [params.value, blankValueNote(params.noun)] : [params.value],
  excluded: params.includeNull ? [] : [blankValueNote(params.noun)],
})

const pluralYears = (value: number) => (value === 1 ? "1 year" : `${value.toLocaleString("en-US")} years`)

export function buildReportFilterRows(
  filters: Filters,
  baselineRanges: BuildSummaryReportInput["baselineRanges"]
): ReportFilterRow[] {
  const rows: ReportFilterRow[] = []

  const mode = filters.accountVisibilityMode ?? "gcc"
  rows.push({
    group: "Scope",
    label: FILTER_METADATA.accountVisibilityMode.label,
    included: [VISIBILITY_LABEL[mode] ?? mode],
    excluded: [],
  })

  const listRowFor = (key: ListFilterKey): ReportFilterRow | null => {
    const values = filters[key]
    if (!Array.isArray(values) || values.length === 0) return null
    const { included, excluded } = splitByMode(values)
    if (included.length === 0 && excluded.length === 0) return null
    const meta = FILTER_METADATA[key]
    return { group: GROUP_LABEL[meta.group], label: meta.label, included, excluded }
  }

  const accountKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "account")
  const centerKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "center")
  const prospectKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "prospect")

  for (const key of accountKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  if (isRangeActive(filters.accountHqRevenueRange, baselineRanges.revenue)) {
    const [min, max] = filters.accountHqRevenueRange
    rows.push(rangeRow({
      group: "Account",
      label: FILTER_METADATA.accountHqRevenueRange.label,
      value: `${formatRevenueInMillions(min)} to ${formatRevenueInMillions(max)} (USD)`,
      includeNull: filters.accountHqRevenueIncludeNull,
      noun: "Accounts",
    }))
  }

  if (isRangeActive(filters.accountYearsInIndiaRange, baselineRanges.yearsInIndia)) {
    const [min, max] = filters.accountYearsInIndiaRange
    rows.push(rangeRow({
      group: "Account",
      label: FILTER_METADATA.accountYearsInIndiaRange.label,
      value: `${pluralYears(min)} to ${pluralYears(max)}`,
      includeNull: filters.yearsInIndiaIncludeNull,
      noun: "Accounts",
    }))
  }

  for (const key of centerKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  if (isRangeActive(filters.centerIncYearRange, baselineRanges.centerIncYear)) {
    const [min, max] = filters.centerIncYearRange
    rows.push(rangeRow({
      group: "Center",
      label: FILTER_METADATA.centerIncYearRange.label,
      value: `${min} to ${max}`,
      includeNull: filters.centerIncYearIncludeNull,
      noun: "Centers",
    }))
  }

  for (const key of prospectKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  return rows
}

export function buildReportMetrics(
  counts: SummaryReportCounts,
  enabledSections: Record<ReportSection, boolean>
): ReportMetric[] {
  const metrics: ReportMetric[] = []

  if (enabledSections.accounts) {
    metrics.push({
      id: "accounts",
      label: "Accounts",
      description: "Companies matching the applied filters",
      filtered: counts.filteredAccountsCount,
      total: counts.totalAccountsCount,
    })
  }

  if (enabledSections.centers) {
    metrics.push({
      id: "centers",
      label: "Centers",
      description: "Delivery and capability centers",
      filtered: counts.filteredCentersCount,
      total: counts.totalCentersCount,
    })
    metrics.push({
      id: "upcomingCenters",
      label: "Upcoming Centers",
      description: "Centers with an Upcoming status",
      filtered: counts.filteredUpcomingCentersCount,
      total: counts.totalUpcomingCentersCount,
    })
  }

  if (enabledSections.prospects) {
    metrics.push({
      id: "prospects",
      label: "Prospects",
      description: "Decision makers and contacts",
      filtered: counts.filteredProspectsCount,
      total: counts.totalProspectsCount,
    })
  }

  if (enabledSections.centers) {
    metrics.push({
      id: "headcount",
      label: "Headcount",
      description: "Employees across matching centers",
      filtered: counts.filteredHeadcount,
      total: counts.totalHeadcount,
    })
  }

  return metrics
}

// Mirrors the PieChartCard rule: slices under this share collapse into "Others".
const OTHERS_THRESHOLD_PERCENT = 5

export function buildReportChart(title: string, countLabel: string, data: ChartData[]): ReportChart {
  const total = data.reduce((sum, item) => sum + (typeof item.value === "number" ? item.value : 0), 0)
  const major: ReportChartSegment[] = []
  const othersMembers: ReportChartOtherMember[] = []

  data.forEach((item, index) => {
    const value = typeof item.value === "number" ? item.value : 0
    if (value <= 0) return
    const share = total > 0 ? (value / total) * 100 : 0
    const name = item.name || "Unknown"
    if (share < OTHERS_THRESHOLD_PERCENT) {
      othersMembers.push({ name, value, percent: Math.round(share * 10) / 10 })
      return
    }
    major.push({
      name,
      value,
      percent: Math.round(share * 10) / 10,
      color: item.fill || PIE_CHART_COLORS[index % PIE_CHART_COLORS.length],
    })
  })

  major.sort((a, b) => b.value - a.value)
  othersMembers.sort((a, b) => b.value - a.value)

  const othersTotal = othersMembers.reduce((sum, member) => sum + member.value, 0)
  if (othersTotal > 0) {
    major.push({
      name: "Others",
      value: othersTotal,
      percent: Math.round((othersTotal / total) * 1000) / 10,
      color: PIE_CHART_COLORS[PIE_CHART_COLORS.length - 1],
    })
  }

  return { title, countLabel, total, segments: major, othersMembers }
}

export function buildReportChartGroups(
  sources: SummaryReportChartSources | undefined,
  enabledSections: Record<ReportSection, boolean>,
  counts: SummaryReportCounts
): ReportChartGroup[] {
  if (!sources) return []
  const groups: ReportChartGroup[] = []

  if (enabledSections.accounts) {
    const src = sources.accounts
    groups.push({
      section: "accounts",
      title: "Accounts",
      matching: counts.filteredAccountsCount,
      databaseTotal: counts.totalAccountsCount,
      charts: [
        buildReportChart("Country", "Accounts", src.regionData),
        buildReportChart("Industry", "Accounts", src.primaryNatureData),
        buildReportChart("Revenue Range", "Accounts", src.revenueRangeData),
        buildReportChart("GCC Aggregate Headcount (India)", "Accounts", src.employeesRangeData),
      ],
    })
  }

  if (enabledSections.centers) {
    const src = sources.centers
    groups.push({
      section: "centers",
      title: "Centers",
      matching: counts.filteredCentersCount,
      databaseTotal: counts.totalCentersCount,
      charts: [
        buildReportChart("Center Type", "Centers", src.centerTypeData),
        buildReportChart("Center Headcount", "Centers", src.employeesRangeData),
        buildReportChart("City", "Centers", src.cityData),
        buildReportChart("Function", "Centers", src.functionData),
      ],
    })
  }

  if (enabledSections.prospects) {
    const src = sources.prospects
    groups.push({
      section: "prospects",
      title: "Prospects",
      matching: counts.filteredProspectsCount,
      databaseTotal: counts.totalProspectsCount,
      charts: [
        buildReportChart("Department", "Prospects", src.departmentData),
        buildReportChart("Level", "Prospects", src.levelData),
      ],
    })
  }

  return groups
}

export function buildSummaryReport(input: BuildSummaryReportInput): SummaryReportModel {
  return {
    title: "Dashboard Summary Report",
    productName: "Bamboo Reports",
    generatedAt: input.generatedAt ?? new Date(),
    generatedBy: input.generatedBy,
    activeView: input.activeView,
    activeFilterCount: input.activeFilterCount,
    metrics: buildReportMetrics(input.counts, input.enabledSections),
    filters: buildReportFilterRows(input.filters, input.baselineRanges),
    chartGroups: buildReportChartGroups(input.charts, input.enabledSections, input.counts),
  }
}

export function formatSharePercent(filtered: number, total: number): string {
  if (total <= 0) return "0%"
  const pct = (filtered / total) * 100
  if (pct >= 99.95) return "100%"
  if (pct < 0.05 && filtered > 0) return "<0.1%"
  return `${pct.toFixed(1)}%`
}

export function buildSummaryReportFilename(generatedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}`
  return `bamboo-reports-summary-${stamp}.pdf`
}
