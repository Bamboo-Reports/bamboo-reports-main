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

const allSections = { accounts: true, centers: true, prospects: true }

describe("buildReportFilterRows", () => {
  it("always leads with the account visibility scope", () => {
    const rows = buildReportFilterRows(
      createDefaultFilters({ accountHqRevenueRange: [0, 5000], accountYearsInIndiaRange: [0, 40], centerIncYearRange: [1990, 2026] }),
      baselineRanges
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ group: "Scope", label: "Account Visibility", included: ["GCC accounts only"] })
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
    const country = rows.find((row) => row.label === "HQ Country")
    expect(country).toMatchObject({
      group: "Account",
      included: ["United States", "Germany"],
      excluded: ["China"],
    })
    const title = rows.find((row) => row.label === "Job Title")
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
    expect(labels).toContain("HQ Company Revenue")
    expect(labels).toContain("Incorporation Timeline")
    expect(labels).not.toContain("Years In India")

    const revenue = rows.find((row) => row.label === "HQ Company Revenue")
    expect(revenue?.included).toEqual(["100M to 2,500M (USD)"])
    expect(revenue?.excluded).toEqual(["Accounts with no recorded value"])

    const incYear = rows.find((row) => row.label === "Incorporation Timeline")
    expect(incYear?.included).toEqual(["2015 to 2026", "Centers with no recorded value"])
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
  it("includes every metric when all sections are procured", () => {
    const ids = buildReportMetrics(counts, allSections).map((metric) => metric.id)
    expect(ids).toEqual(["accounts", "centers", "upcomingCenters", "prospects", "headcount"])
  })

  it("drops metrics for sections that are not procured", () => {
    const ids = buildReportMetrics(counts, { accounts: true, centers: false, prospects: false }).map(
      (metric) => metric.id
    )
    expect(ids).toEqual(["accounts"])
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
      enabledSections: allSections,
      activeView: "centers",
      activeFilterCount: 1,
      generatedBy: "ops@example.com",
      generatedAt,
    })
    expect(model.title).toBe("Dashboard Summary Report")
    expect(model.productName).toBe("Bamboo Reports")
    expect(model.generatedBy).toBe("ops@example.com")
    expect(model.activeView).toBe("centers")
    expect(model.metrics).toHaveLength(5)
    expect(model.filters.map((row) => row.label)).toEqual(["Account Visibility", "Center Type"])
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
    const groups = buildReportChartGroups(sources, allSections, counts)
    expect(groups.map((group) => [group.title, group.charts.length])).toEqual([
      ["Accounts", 4],
      ["Centers", 4],
      ["Prospects", 2],
    ])
    expect(groups.map((group) => [group.matching, group.databaseTotal])).toEqual([
      [120, 2400],
      [300, 6000],
      [900, 30000],
    ])
  })

  it("skips sections that are not procured and missing sources", () => {
    expect(
      buildReportChartGroups(sources, { accounts: false, centers: true, prospects: false }, counts)
    ).toHaveLength(1)
    expect(buildReportChartGroups(undefined, allSections, counts)).toEqual([])
  })
})
