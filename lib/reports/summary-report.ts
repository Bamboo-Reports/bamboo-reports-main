import type { AccountVisibilityMode, ChartData, Filters, FilterValue } from "@/lib/types"
import { FILTER_METADATA } from "@/lib/analytics/filter-metadata"
import { compareRangeLabels } from "@/lib/utils/range-order"
import { accountHeadcountChartTitle } from "@/lib/utils/chart-helpers"
import { formatRevenueInMillions } from "@/lib/utils/helpers"
import { FIELD_LABELS } from "@/lib/dashboard/filter-spec"
import { isRangeActive } from "@/lib/dashboard/active-filters"

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

// Filter names as the sidebar shows them. FILTER_METADATA keeps its own
// labels because analytics reports filter_name with them.
const reportLabel = (key: keyof Filters) =>
  FIELD_LABELS[key] ?? (FILTER_METADATA as Record<string, { label: string }>)[key]?.label ?? key

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
  "accountNasscomStatusValues",
  "accountHqEmployeeRangeValues",
  "accountCenterEmployeesRangeValues",
  "centerTypeValues",
  "centerFocusValues",
  "centerStatusValues",
  "centerStateValues",
  "centerCityValues",
  "centerEmployeesRangeValues",
  "functionNameValues",
  "techSoftwareInUseKeywords",
  "prospectDepartmentValues",
  "prospectHeadTypeValues",
  "prospectLevelValues",
  "prospectEngagedValues",
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
    label: reportLabel("accountVisibilityMode"),
    included: [VISIBILITY_LABEL[mode] ?? mode],
    excluded: [],
  })

  const listRowFor = (key: ListFilterKey): ReportFilterRow | null => {
    const values = filters[key]
    if (!Array.isArray(values) || values.length === 0) return null
    const { included, excluded } = splitByMode(values)
    if (included.length === 0 && excluded.length === 0) return null
    const meta = FILTER_METADATA[key]
    return { group: GROUP_LABEL[meta.group], label: reportLabel(key), included, excluded }
  }

  const accountKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "account")
  const centerKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "center")
  const prospectKeys = LIST_FILTER_KEYS.filter((key) => FILTER_METADATA[key].group === "prospect")

  for (const key of accountKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  if (filters.accountNameValues.length > 0) {
    const { included, excluded } = splitByMode(filters.accountNameValues)
    const lists = filters.accountListValues.length
    const describe = (n: number) => `${n} account${n === 1 ? "" : "s"}${lists > 0 ? ` from ${lists} list${lists === 1 ? "" : "s"}` : ""}`
    rows.push({
      group: GROUP_LABEL.account,
      label: reportLabel("accountListValues"),
      included: included.length > 0 ? [describe(included.length)] : [],
      excluded: excluded.length > 0 ? [describe(excluded.length)] : [],
    })
  }

  if (isRangeActive(filters.accountHqRevenueRange, baselineRanges.revenue, filters.accountHqRevenueIncludeNull)) {
    const [min, max] = filters.accountHqRevenueRange
    rows.push(rangeRow({
      group: "Account",
      label: reportLabel("accountHqRevenueRange"),
      value: `${formatRevenueInMillions(min)} to ${formatRevenueInMillions(max)} (USD)`,
      includeNull: filters.accountHqRevenueIncludeNull,
      noun: "Accounts",
    }))
  }

  if (isRangeActive(filters.accountYearsInIndiaRange, baselineRanges.yearsInIndia, filters.yearsInIndiaIncludeNull)) {
    const [min, max] = filters.accountYearsInIndiaRange
    rows.push(rangeRow({
      group: "Account",
      label: reportLabel("accountYearsInIndiaRange"),
      value: `${pluralYears(min)} to ${pluralYears(max)}`,
      includeNull: filters.yearsInIndiaIncludeNull,
      noun: "Accounts",
    }))
  }

  for (const key of centerKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  if (isRangeActive(filters.centerIncYearRange, baselineRanges.centerIncYear, filters.centerIncYearIncludeNull)) {
    const [min, max] = filters.centerIncYearRange
    rows.push(rangeRow({
      group: "Center",
      label: reportLabel("centerIncYearRange"),
      value: `${min} to ${max}`,
      includeNull: filters.centerIncYearIncludeNull,
      noun: "Centres",
    }))
  }

  for (const key of prospectKeys) {
    const row = listRowFor(key)
    if (row) rows.push(row)
  }

  return rows
}

export function buildReportMetrics(counts: SummaryReportCounts): ReportMetric[] {
  const metrics: ReportMetric[] = []

  metrics.push({
    id: "accounts",
    label: "Accounts",
    description: "Companies matching the applied filters",
    filtered: counts.filteredAccountsCount,
    total: counts.totalAccountsCount,
  })

  metrics.push({
    id: "centers",
    label: "Centres",
    description: "Delivery and capability centres",
    filtered: counts.filteredCentersCount,
    total: counts.totalCentersCount,
  })
  metrics.push({
    id: "upcomingCenters",
    label: "Upcoming centres",
    description: "Centres with an upcoming status",
    filtered: counts.filteredUpcomingCentersCount,
    total: counts.totalUpcomingCentersCount,
  })

  metrics.push({
    id: "prospects",
    label: "Prospects",
    description: "Decision makers and contacts",
    filtered: counts.filteredProspectsCount,
    total: counts.totalProspectsCount,
  })

  metrics.push({
    id: "headcount",
    label: "Headcount",
    description: "Employees across matching centres",
    filtered: counts.filteredHeadcount,
    total: counts.totalHeadcount,
  })

  return metrics
}

// Mirrors the PieChartCard rule: slices under this share collapse into "Others".
const OTHERS_THRESHOLD_PERCENT = 5

/**
 * `order: "range"` is for bucket charts like revenue range: every bucket is
 * kept, in range order, as on the dashboard, instead of folding small ones.
 */
export function buildReportChart(
  title: string,
  countLabel: string,
  data: ChartData[],
  order: "size" | "range" = "size"
): ReportChart {
  const total = data.reduce((sum, item) => sum + (typeof item.value === "number" ? item.value : 0), 0)
  const major: ReportChartSegment[] = []
  const othersMembers: ReportChartOtherMember[] = []
  // The dashboard's chart data can already carry an "Others" slice; fold it
  // into the report's own Others so the chart never lists Others twice.
  let incomingOthers = 0

  data.forEach((item, index) => {
    const value = typeof item.value === "number" ? item.value : 0
    if (value <= 0) return
    const share = total > 0 ? (value / total) * 100 : 0
    const name = item.name || "Unknown"
    if (name.trim().toLowerCase() === "others") {
      incomingOthers += value
      return
    }
    if (order !== "range" && share < OTHERS_THRESHOLD_PERCENT) {
      othersMembers.push({ name, value, percent: Math.round(share * 10) / 10 })
      return
    }
    major.push({
      name,
      value,
      percent: Math.round(share * 10) / 10,
    })
  })

  major.sort(order === "range" ? (a, b) => compareRangeLabels(a.name, b.name) : (a, b) => b.value - a.value)
  othersMembers.sort((a, b) => b.value - a.value)

  const othersTotal = othersMembers.reduce((sum, member) => sum + member.value, incomingOthers)
  if (othersTotal > 0) {
    major.push({
      name: "Others",
      value: othersTotal,
      percent: Math.round((othersTotal / total) * 1000) / 10,
    })
  }

  return { title, countLabel, total, segments: major, othersMembers }
}

export function buildReportChartGroups(
  sources: SummaryReportChartSources | undefined,
  counts: SummaryReportCounts,
  visibilityMode?: AccountVisibilityMode
): ReportChartGroup[] {
  if (!sources) return []
  const groups: ReportChartGroup[] = []

  const accountSrc = sources.accounts
  groups.push({
    section: "accounts",
    title: "Accounts",
    matching: counts.filteredAccountsCount,
    databaseTotal: counts.totalAccountsCount,
    charts: [
      buildReportChart("Country", "Accounts", accountSrc.regionData),
      buildReportChart("Industry", "Accounts", accountSrc.primaryNatureData),
      buildReportChart("Revenue range", "Accounts", accountSrc.revenueRangeData, "range"),
      buildReportChart(accountHeadcountChartTitle(visibilityMode), "Accounts", accountSrc.employeesRangeData, "range"),
    ],
  })

  const centerSrc = sources.centers
  groups.push({
    section: "centers",
    title: "Centres",
    matching: counts.filteredCentersCount,
    databaseTotal: counts.totalCentersCount,
    charts: [
      buildReportChart("Centre type", "Centres", centerSrc.centerTypeData),
      buildReportChart("Centre headcount", "Centres", centerSrc.employeesRangeData, "range"),
      buildReportChart("City", "Centres", centerSrc.cityData),
      buildReportChart("Function", "Centres", centerSrc.functionData),
    ],
  })

  const prospectSrc = sources.prospects
  groups.push({
    section: "prospects",
    title: "Prospects",
    matching: counts.filteredProspectsCount,
    databaseTotal: counts.totalProspectsCount,
    charts: [
      buildReportChart("Department", "Prospects", prospectSrc.departmentData),
      buildReportChart("Level", "Prospects", prospectSrc.levelData),
    ],
  })

  return groups
}

export function buildSummaryReport(input: BuildSummaryReportInput): SummaryReportModel {
  return {
    title: "Dashboard summary",
    productName: "Bamboo Reports",
    generatedAt: input.generatedAt ?? new Date(),
    generatedBy: input.generatedBy,
    activeView: input.activeView,
    activeFilterCount: input.activeFilterCount,
    metrics: buildReportMetrics(input.counts),
    filters: buildReportFilterRows(input.filters, input.baselineRanges),
    chartGroups: buildReportChartGroups(input.charts, input.counts, input.filters.accountVisibilityMode),
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
