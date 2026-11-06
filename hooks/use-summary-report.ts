"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { fetchDashboardChartsFull, fetchDashboardSummary, type FacetRanges } from "@/lib/dashboard/api-client"
import { buildSummaryReport } from "@/lib/reports/summary-report"
import type { Filters } from "@/lib/types"
import { devError } from "@/lib/utils/dev-log"
import type { DashboardSection } from "@/hooks/use-dashboard-layout"
import { normalizeFiltersForServer } from "@/hooks/use-server-dashboard-data"

type Range = { min: number; max: number }

export interface UseSummaryReportParams {
  filters: Filters
  serverRanges: FacetRanges | null
  ranges: { revenue: Range; yearsInIndia: Range; centerIncYear: Range }
  activeSection: DashboardSection
  activeFiltersCount: number
  userEmail: string | null
}

/** Builds and downloads the summary PDF for the applied filters. */
export function useSummaryReport({
  filters,
  serverRanges,
  ranges,
  activeSection,
  activeFiltersCount,
  userEmail,
}: UseSummaryReportParams) {
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const { revenue, yearsInIndia, centerIncYear } = ranges

  const handleGenerateReport = useCallback(async () => {
    if (isGeneratingReport) return
    setIsGeneratingReport(true)
    try {
      // Fetch counts and every chart bucket for the applied filters directly.
      // The dashboard state may still be catching up (the fetch is debounced)
      // and its chart payload is capped (top 10, city "Others"). Both requests
      // use the same canonical wire filters as the dashboard so the figures
      // match the cards and hit the same cache.
      const wireFilters = normalizeFiltersForServer(filters, serverRanges)
      const [summaryRes, chartsRes] = await Promise.all([
        fetchDashboardSummary(wireFilters),
        fetchDashboardChartsFull(wireFilters),
      ])
      const counts = {
        filteredAccountsCount: summaryRes.filtered.accounts,
        totalAccountsCount: summaryRes.full.accounts,
        filteredCentersCount: summaryRes.filtered.centers,
        totalCentersCount: summaryRes.full.centers,
        filteredUpcomingCentersCount: summaryRes.filtered.upcomingCenters,
        totalUpcomingCentersCount: summaryRes.full.upcomingCenters,
        filteredProspectsCount: summaryRes.filtered.prospects,
        totalProspectsCount: summaryRes.full.prospects,
        filteredHeadcount: summaryRes.filtered.headcount,
        totalHeadcount: summaryRes.full.headcount,
      }
      const charts = {
        accounts: chartsRes.account,
        centers: chartsRes.center,
        prospects: { departmentData: chartsRes.prospect.departmentData, levelData: chartsRes.prospect.levelData },
      }
      const model = buildSummaryReport({
        filters,
        counts,
        baselineRanges: { revenue, yearsInIndia, centerIncYear },
        activeView: activeSection,
        activeFilterCount: activeFiltersCount,
        charts,
        generatedBy: userEmail ?? undefined,
      })
      const { downloadSummaryReportPdf } = await import("@/lib/reports/summary-report-pdf")
      await downloadSummaryReportPdf(model)
      toast.success("Summary PDF downloaded")
      captureEvent(ANALYTICS_EVENTS.SUMMARY_REPORT_DOWNLOADED, {
        active_filters_count: activeFiltersCount,
        active_view: activeSection,
        metrics_count: model.metrics.length,
      })
    } catch (error) {
      devError("Summary report failed", error)
      toast.error("Could not create the summary PDF", { description: "Try again in a moment" })
      captureEvent(ANALYTICS_EVENTS.SUMMARY_REPORT_FAILED, {
        active_filters_count: activeFiltersCount,
      })
    } finally {
      setIsGeneratingReport(false)
    }
  }, [
    isGeneratingReport,
    filters,
    revenue,
    yearsInIndia,
    centerIncYear,
    activeSection,
    activeFiltersCount,
    serverRanges,
    userEmail,
  ])

  return { isGeneratingReport, handleGenerateReport }
}
