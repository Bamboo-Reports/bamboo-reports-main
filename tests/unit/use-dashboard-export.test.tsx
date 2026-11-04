// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { buildExportPayload, useDashboardExport, type UseDashboardExportParams } from "@/hooks/use-dashboard-export"
import { useSummaryReport, type UseSummaryReportParams } from "@/hooks/use-summary-report"
import { fetchDashboardChartsFull, fetchDashboardSummary } from "@/lib/dashboard/api-client"
import { downloadSummaryReportPdf } from "@/lib/reports/summary-report-pdf"
import type { Filters } from "@/lib/types"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/dashboard/api-client", () => ({
  fetchDashboardSummary: vi.fn(),
  fetchDashboardChartsFull: vi.fn(),
}))
vi.mock("@/lib/reports/summary-report-pdf", () => ({ downloadSummaryReportPdf: vi.fn() }))
vi.mock("@/lib/reports/summary-report", () => ({ buildSummaryReport: vi.fn(() => ({ metrics: [1, 2, 3] })) }))
vi.mock("@/hooks/use-server-dashboard-data", () => ({ normalizeFiltersForServer: vi.fn((f) => f) }))

const FILTERS = { accountNames: [] } as unknown as Filters
const RANGES = {
  revenue: { min: 0, max: 100 },
  yearsInIndia: { min: 0, max: 50 },
  centerIncYear: { min: 1990, max: 2026 },
}
const SUMMARY = { filtered: { accounts: 5, centers: 6, services: 7, prospects: 8 } } as UseDashboardExportParams["summary"]

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(captureEvent).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("buildExportPayload", () => {
  it("exports every sheet for the filters, counted from the summary", () => {
    const payload = buildExportPayload(null, FILTERS, 2, SUMMARY)
    expect(payload).toMatchObject({
      isFiltered: true,
      filtersSnapshot: FILTERS,
      filters: FILTERS,
      accountNames: null,
      centerKeys: null,
      allowedDatasets: undefined,
      rowCounts: { accounts: 5, centers: 6, services: 7, prospects: 8 },
    })
    expect(buildExportPayload(null, FILTERS, 0, null)).toMatchObject({
      isFiltered: false,
      rowCounts: { accounts: 0, centers: 0, services: 0, prospects: 0 },
    })
  })

  it("locks a selection to its own sheet", () => {
    const accounts = buildExportPayload({ dataset: "accounts", accountNames: ["A", "B"] }, FILTERS, 0, SUMMARY)
    expect(accounts).toMatchObject({
      isFiltered: true,
      accountNames: ["A", "B"],
      centerKeys: [],
      allowedDatasets: ["accounts"],
      filters: undefined,
      rowCounts: { accounts: 2 },
      filtersSnapshot: { accountNames: [], selection: { dataset: "accounts", accountNames: ["A", "B"] } },
    })
    const centers = buildExportPayload({ dataset: "centers", centerKeys: ["c1"] }, FILTERS, 0, SUMMARY)
    expect(centers).toMatchObject({ accountNames: [], centerKeys: ["c1"], allowedDatasets: ["centers"], rowCounts: { centers: 1 } })
  })

  it("splits selected prospects into keyed and keyless ids", () => {
    const payload = buildExportPayload({ dataset: "prospects", prospectIds: ["k1", "Acme::Jo::1", "k2"] }, FILTERS, 0, SUMMARY)
    expect(payload).toMatchObject({
      prospectKeys: ["k1", "k2"],
      keylessProspectIds: ["Acme::Jo::1"],
      allowedDatasets: ["prospects"],
      rowCounts: { prospects: 3 },
    })
  })
})

describe("useDashboardExport", () => {
  const setup = (over: Partial<UseDashboardExportParams> = {}) =>
    renderHook(() =>
      useDashboardExport({
        canExport: true,
        filters: FILTERS,
        activeFiltersCount: 1,
        summary: SUMMARY,
        ranges: RANGES,
        onExportCompleted: vi.fn(),
        ...over,
      })
    )

  it("opens the full export with every sheet, or one table's sheet", () => {
    const { result } = setup()
    act(() => result.current.handleExportAll())
    expect(result.current.dialogProps).toMatchObject({ open: true, exportScope: "all", initialDatasets: undefined, compact: false })
    act(() => result.current.openFullExport("centers"))
    expect(result.current.dialogProps.initialDatasets).toEqual(["centers"])
  })

  it("opens a selection export and ignores empty selections", () => {
    const { result } = setup()
    act(() => result.current.handleDownloadSelection({ dataset: "accounts", accountNames: [] }))
    expect(result.current.dialogProps.open).toBe(false)
    act(() => result.current.handleDownloadSelection({ dataset: "accounts", accountNames: ["A"] }))
    expect(result.current.dialogProps).toMatchObject({
      open: true,
      exportScope: "selection",
      compact: true,
      filterSummary: undefined,
      initialDatasets: undefined,
    })
  })

  it("does nothing for users who cannot export", () => {
    const { result } = setup({ canExport: false })
    act(() => result.current.handleExportAll())
    act(() => result.current.handleDownloadSelection({ dataset: "accounts", accountNames: ["A"] }))
    expect(result.current.dialogProps.open).toBe(false)
  })

  it("keeps the selection until the close animation ends", () => {
    const { result } = setup()
    act(() => result.current.handleDownloadSelection({ dataset: "centers", centerKeys: ["c1"] }))
    act(() => result.current.dialogProps.onOpenChange(false))
    expect(result.current.dialogProps.open).toBe(false)
    expect(result.current.dialogProps.exportScope).toBe("selection")
    act(() => vi.advanceTimersByTime(350))
    expect(result.current.dialogProps.exportScope).toBe("all")
  })

  it("a new export cancels the pending clear from the last close", () => {
    const { result } = setup()
    act(() => result.current.handleDownloadSelection({ dataset: "centers", centerKeys: ["c1"] }))
    act(() => result.current.dialogProps.onOpenChange(false))
    act(() => result.current.handleDownloadSelection({ dataset: "accounts", accountNames: ["A"] }))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.dialogProps).toMatchObject({ open: true, exportScope: "selection", accountNames: ["A"] })
  })
})

describe("useSummaryReport", () => {
  const params: UseSummaryReportParams = {
    filters: FILTERS,
    serverRanges: null,
    ranges: RANGES,
    activeSection: "centers",
    activeFiltersCount: 2,
    userEmail: "a@b.c",
  }
  const summary = {
    filtered: { accounts: 1, centers: 2, upcomingCenters: 3, prospects: 4, headcount: 5 },
    full: { accounts: 10, centers: 20, upcomingCenters: 30, prospects: 40, headcount: 50 },
  }
  const charts = { account: {}, center: {}, prospect: { departmentData: [], levelData: [] } }

  it("downloads the PDF and reports it", async () => {
    vi.useRealTimers()
    vi.mocked(fetchDashboardSummary).mockResolvedValue(summary as never)
    vi.mocked(fetchDashboardChartsFull).mockResolvedValue(charts as never)
    const { result } = renderHook(() => useSummaryReport(params))
    await act(() => result.current.handleGenerateReport())
    expect(downloadSummaryReportPdf).toHaveBeenCalledWith({ metrics: [1, 2, 3] })
    expect(toast.success).toHaveBeenCalledWith("Summary PDF downloaded")
    expect(captureEvent).toHaveBeenCalledWith("summary_report_downloaded", {
      active_filters_count: 2,
      active_view: "centers",
      metrics_count: 3,
    })
    expect(result.current.isGeneratingReport).toBe(false)
  })

  it("shows an error toast when the data cannot be fetched", async () => {
    vi.useRealTimers()
    vi.mocked(fetchDashboardSummary).mockRejectedValue(new Error("down"))
    vi.mocked(fetchDashboardChartsFull).mockResolvedValue(charts as never)
    const { result } = renderHook(() => useSummaryReport(params))
    await act(() => result.current.handleGenerateReport())
    expect(toast.error).toHaveBeenCalledWith("Could not create the summary PDF", { description: "Try again in a moment" })
    expect(captureEvent).toHaveBeenCalledWith("summary_report_failed", { active_filters_count: 2 })
    expect(result.current.isGeneratingReport).toBe(false)
  })
})
