import { describe, expect, it } from "vitest"
import {
  buildReportChart,
  buildReportChartGroups,
  buildReportFilterRows,
  buildReportMetrics,
  buildSummaryReport,
  buildSummaryReportFilename,
  formatSharePercent,
} from "@/lib/reports/summary-report"
import { createDefaultFilters } from "@/lib/dashboard/defaults"
import type { FilterValue } from "@/lib/types"

const inc = (value: string): FilterValue => ({ value, mode: "include" })
const exc = (value: string): FilterValue => ({ value, mode: "exclude" })

const baselineRanges = {
  revenue: { min: 0, max: 5000 },
  yearsInIndia: { min: 0, max: 40 },
  centerIncYear: { min: 1990, max: 2026 },
}

const counts = {
  filteredAccountsCount: 120,
  totalAccountsCount: 2400,
  filteredCentersCount: 300,
  totalCentersCount: 6000,
  filteredUpcomingCentersCount: 4,
  totalUpcomingCentersCount: 80,
  filteredProspectsCount: 900,
  totalProspectsCount: 30000,
  filteredHeadcount: 45000,
  totalHeadcount: 1200000,
}


describe("buildReportFilterRows", () => {
  it("lists a range left at full extent once records with no value are excluded", () => {
    const rows = buildReportFilterRows(
      createDefaultFilters({
        accountHqRevenueRange: [0, 5000],
        accountYearsInIndiaRange: [0, 40],
        centerIncYearRange: [1990, 2026],
        accountHqRevenueIncludeNull: false,
      }),
      baselineRanges
    )
    const revenue = rows.find((row) => row.label === "HQ revenue")
    expect(revenue?.excluded).toEqual(["Accounts with no recorded value"])
  })

  it("always leads with the account visibility scope", () => {
    const rows = buildReportFilterRows(
      createDefaultFilters({ accountHqRevenueRange: [0, 5000], accountYearsInIndiaRange: [0, 40], centerIncYearRange: [1990, 2026] }),
      baselineRanges
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ group: "Scope", label: "Accounts to show", included: ["GCC accounts only"] })
  })

  it("splits list filters into included and excluded values with sidebar labels", () => {
    const filters = createDefaultFilters({
      accountHqRevenueRange: [0, 5000],
      accountYearsInIndiaRange: [0, 40],
      centerIncYearRange: [1990, 2026],
      accountHqCountryValues: [inc("United States"), exc("China"), inc("Germany")],
      prospectTitleKeywords: [inc("CFO")],
    })
    const rows = buildReportFilterRows(filters, baselineRanges)
    const country = rows.find((row) => row.label === "HQ country")
    expect(country).toMatchObject({
      group: "Account",
      included: ["United States", "Germany"],
      excluded: ["China"],
    })
    const title = rows.find((row) => row.label === "Job title")
    expect(title).toMatchObject({ group: "Prospect", included: ["CFO"], excluded: [] })
  })

  it("only reports range filters that differ from the data baseline", () => {
    const filters = createDefaultFilters({
      accountHqRevenueRange: [100, 2500],
      accountHqRevenueIncludeNull: false,
      accountYearsInIndiaRange: [0, 40],
      centerIncYearRange: [2015, 2026],
    })
    const rows = buildReportFilterRows(filters, baselineRanges)
    const labels = rows.map((row) => row.label)
    expect(labels).toContain("HQ revenue")
    expect(labels).toContain("Incorporation year")
    expect(labels).not.toContain("Years in India")

    const revenue = rows.find((row) => row.label === "HQ revenue")
    expect(revenue?.included).toEqual(["100M to 2,500M (USD)"])
    expect(revenue?.excluded).toEqual(["Accounts with no recorded value"])

    const incYear = rows.find((row) => row.label === "Incorporation year")
    expect(incYear?.included).toEqual(["2015 to 2026", "Centres with no recorded value"])
    expect(incYear?.excluded).toEqual([])
  })

  it("orders rows scope, then account, center, prospect", () => {
    const filters = createDefaultFilters({
      accountVisibilityMode: "all",
      accountHqRevenueRange: [0, 5000],
      accountYearsInIndiaRange: [0, 40],
      centerIncYearRange: [1990, 2026],
      prospectLevelValues: [inc("CXO")],
      centerCityValues: [inc("Bengaluru")],
      accountHqRegionValues: [inc("North America")],
    })
    const groups = buildReportFilterRows(filters, baselineRanges).map((row) => row.group)
    expect(groups).toEqual(["Scope", "Account", "Center", "Prospect"])
  })
})

describe("buildReportMetrics", () => {
  it("includes every metric in dashboard order", () => {
    const ids = buildReportMetrics(counts).map((metric) => metric.id)
    expect(ids).toEqual(["accounts", "centers", "upcomingCenters", "prospects", "headcount"])
  })
})

describe("buildSummaryReport", () => {
  it("assembles title, metadata, metrics and filters", () => {
    const generatedAt = new Date(2026, 8, 3, 14, 5)
    const model = buildSummaryReport({
      filters: createDefaultFilters({
        accountHqRevenueRange: [0, 5000],
        accountYearsInIndiaRange: [0, 40],
        centerIncYearRange: [1990, 2026],
        centerTypeValues: [inc("GCC")],
      }),
      counts,
      baselineRanges,
      activeView: "centers",
      activeFilterCount: 1,
      generatedBy: "ops@example.com",
      generatedAt,
    })
    expect(model.title).toBe("Dashboard summary")
    expect(model.productName).toBe("Bamboo Reports")
    expect(model.generatedBy).toBe("ops@example.com")
    expect(model.activeView).toBe("centers")
    expect(model.metrics).toHaveLength(5)
    expect(model.filters.map((row) => row.label)).toEqual(["Accounts to show", "Centre type"])
  })
})

describe("formatSharePercent", () => {
  it("formats normal, full, tiny and empty shares", () => {
    expect(formatSharePercent(120, 2400)).toBe("5.0%")
    expect(formatSharePercent(2400, 2400)).toBe("100%")
    expect(formatSharePercent(1, 100000)).toBe("<0.1%")
    expect(formatSharePercent(0, 0)).toBe("0%")
  })
})

describe("buildSummaryReportFilename", () => {
  it("stamps the filename with a sortable local date and time", () => {
    expect(buildSummaryReportFilename(new Date(2026, 8, 3, 9, 7))).toBe(
      "bamboo-reports-summary-2026-09-03-0907.pdf"
    )
  })
})

describe("buildReportChart", () => {
  it("keeps major slices and lists what went into Others with one-decimal shares", () => {
    const chart = buildReportChart("Country", "Accounts", [
      { name: "United States", value: 30 },
      { name: "India", value: 60 },
      { name: "Germany", value: 4 },
      { name: "France", value: 3 },
      { name: "Empty", value: 0 },
    ])
    expect(chart.total).toBe(97)
    expect(chart.segments.map((segment) => segment.name)).toEqual(["India", "United States", "Others"])
    expect(chart.segments.map((segment) => segment.percent)).toEqual([61.9, 30.9, 7.2])
    expect(chart.segments[2].value).toBe(7)
    expect(chart.othersMembers).toEqual([
      { name: "Germany", value: 4, percent: 4.1 },
      { name: "France", value: 3, percent: 3.1 },
    ])
  })

  it("folds an incoming Others slice into a single Others segment", () => {
    const chart = buildReportChart("City", "Centres", [
      { name: "Bengaluru", value: 60 },
      { name: "Others", value: 30 },
      { name: "Pune", value: 8 },
      { name: "Kochi", value: 2 },
    ])
    expect(chart.segments.map((segment) => [segment.name, segment.value])).toEqual([
      ["Bengaluru", 60],
      ["Pune", 8],
      ["Others", 32],
    ])
  })

  it("returns an empty chart for no data", () => {
    const chart = buildReportChart("City", "Centers", [])
    expect(chart.total).toBe(0)
    expect(chart.segments).toEqual([])
    expect(chart.othersMembers).toEqual([])
  })
})

describe("buildReportChartGroups", () => {
  const sources = {
    accounts: { regionData: [], primaryNatureData: [], revenueRangeData: [], employeesRangeData: [] },
    centers: { centerTypeData: [], employeesRangeData: [], cityData: [], functionData: [] },
    prospects: { departmentData: [], levelData: [] },
  }

  it("mirrors the dashboard tabs with four, four and two charts", () => {
    const groups = buildReportChartGroups(sources, counts)
    expect(groups.map((group) => [group.title, group.charts.length])).toEqual([
      ["Accounts", 4],
      ["Centres", 4],
      ["Prospects", 2],
    ])
    expect(groups.map((group) => [group.matching, group.databaseTotal])).toEqual([
      [120, 2400],
      [300, 6000],
      [900, 30000],
    ])
  })

  it("returns no groups when chart sources are missing", () => {
    expect(buildReportChartGroups(undefined, counts)).toEqual([])
  })
})

describe("buildReportChart in range order", () => {
  it("keeps small buckets and lists them in range order", () => {
    const chart = buildReportChart("Centre headcount", "Centres", [
      { name: "201 - 500", value: 500 },
      { name: "<50", value: 400 },
      { name: "10K+", value: 10 },
      { name: "1K - 5K", value: 90 },
    ], "range")
    expect(chart.segments.map((s) => s.name)).toEqual(["<50", "201 - 500", "1K - 5K", "10K+"])
    expect(chart.othersMembers).toEqual([])
  })
})

describe("accountHeadcountChartTitle", () => {
  it("only says GCC when the view is limited to GCCs", async () => {
    const { accountHeadcountChartTitle } = await import("@/lib/utils/chart-helpers")
    expect(accountHeadcountChartTitle("gcc")).toBe("GCC aggregate headcount (India)")
    expect(accountHeadcountChartTitle(undefined)).toBe("GCC aggregate headcount (India)")
    expect(accountHeadcountChartTitle("nonGcc")).toBe("Aggregate headcount (India)")
    expect(accountHeadcountChartTitle("all")).toBe("Aggregate headcount (India)")
  })
})

describe("formatRevenueRange", () => {
  it("writes stored ranges the way the revenue filter does", async () => {
    const { formatRevenueRange } = await import("@/lib/utils/helpers")
    expect(formatRevenueRange("10Mn - 50Mn")).toBe("$10M to $50M")
    expect(formatRevenueRange("501Mn - 1Bn")).toBe("$501M to $1B")
    expect(formatRevenueRange("<10Mn")).toBe("Under $10M")
    expect(formatRevenueRange(">50Bn")).toBe("$50B+")
    expect(formatRevenueRange("Unknown")).toBe("Unknown")
    expect(formatRevenueRange(null)).toBe("")
  })
})
