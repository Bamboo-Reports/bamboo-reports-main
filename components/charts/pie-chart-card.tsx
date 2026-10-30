"use client"

import React, { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiPieChartLine } from "@remixicon/react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"
import { ChartWaveSkeleton } from "@/components/ui/chart-wave-skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { ChartData } from "@/lib/types"
import type { Options, Point } from "highcharts"
import { compareRangeLabels } from "@/lib/utils/range-order"

export interface PieChartLabelDisplay {
  showCategoryLabels: boolean
  showPercentages: boolean
}

// Longer names are shortened in the slice label (the tooltip shows them in
// full) so the percentage is never cut off.
const MAX_LABEL_CATEGORY_LENGTH = 20

export function formatPieChartDataLabel(
  categoryName: string,
  percent: number,
  display: PieChartLabelDisplay
) {
  const category =
    categoryName.length > MAX_LABEL_CATEGORY_LENGTH
      ? `${categoryName.slice(0, MAX_LABEL_CATEGORY_LENGTH - 1).trimEnd()}…`
      : categoryName
  if (display.showCategoryLabels && display.showPercentages) {
    return `${category}: ${percent}%`
  }
  if (display.showCategoryLabels) {
    return category
  }
  if (display.showPercentages) {
    return `${percent}%`
  }
  return ""
}

interface PieChartCardProps {
  title: string
  data: ChartData[]
  dataKey?: string
  countLabel?: string
  showBigPercentage?: boolean
  labelDisplay: PieChartLabelDisplay
  onLabelDisplayChange: (display: PieChartLabelDisplay) => void
  /** A newer filter state is loading; shown data (if any) is the previous state's. */
  loading?: boolean
  /**
   * "range" for bucket labels like "<50" or "1K - 5K": slices go in range
   * order, shaded light to dark, instead of largest first.
   */
  order?: "size" | "range"
}

export const PieChartCard = memo(({
  title,
  data,
  dataKey = "value",
  countLabel = "Count",
  showBigPercentage = false,
  labelDisplay,
  onLabelDisplayChange,
  loading = false,
  order = "size",
}: PieChartCardProps) => {
  const OTHERS_THRESHOLD_PERCENT = 5
  // Safety check: ensure data is an array
  const safeData = React.useMemo(() => data || [], [data])
  const [chartLib, setChartLib] = React.useState<{
    Highcharts: typeof import("highcharts")
    HighchartsReact: React.ComponentType<any>
  } | null>(null)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      const highchartsModule = await import("highcharts")
      const Highcharts = (highchartsModule as any).default ?? highchartsModule
      const accessibilityModule = await import("highcharts/modules/accessibility")
      const HighchartsAccessibility = (accessibilityModule as any).default ?? accessibilityModule
      if (typeof HighchartsAccessibility === "function") {
        HighchartsAccessibility(Highcharts)
      }
      const highchartsReactModule = await import("highcharts-react-official")
      const HighchartsReact = (highchartsReactModule as any).default ?? highchartsReactModule
      if (active) {
        setChartLib({ Highcharts, HighchartsReact })
      }
    }
    load().catch(() => {
      if (active) {
        setChartLib(null)
      }
    })
    return () => {
      active = false
    }
  }, [])

  // Calculate total for percentage calculation
  const total = React.useMemo(() => {
    return safeData.reduce((sum, item) => {
      const rawValue = (item as unknown as Record<string, number | undefined>)[dataKey]
      return sum + (typeof rawValue === "number" ? rawValue : 0)
    }, 0)
  }, [safeData, dataKey])

  const seriesData = React.useMemo(() => {
    const mappedData = safeData.map((item, index) => {
      const rawValue = (item as unknown as Record<string, number | undefined>)[dataKey]
      return {
        name: item.name,
        y: typeof rawValue === "number" ? rawValue : 0,
        color: item.fill || PIE_CHART_COLORS[index % PIE_CHART_COLORS.length],
      }
    })

    if (total <= 0) {
      return mappedData
    }

    const majorSegments: Array<{ name: string; y: number; color: string }> = []
    let othersTotal = 0

    mappedData.forEach((segment) => {
      const percent = (segment.y / total) * 100
      // The API already sends the long tail as "Others"; merge small slices into it.
      if (percent < OTHERS_THRESHOLD_PERCENT || segment.name === "Others") {
        othersTotal += segment.y
      } else {
        majorSegments.push(segment)
      }
    })

    if (order === "range") {
      // Still the largest buckets, shown in range order on a light-to-dark
      // scale; the lightest shade stays reserved for "Others".
      majorSegments.sort((a, b) => compareRangeLabels(a.name, b.name))
      const darkest = 0
      const lightest = PIE_CHART_COLORS.length - 2
      majorSegments.forEach((segment, index) => {
        const step = majorSegments.length > 1 ? index / (majorSegments.length - 1) : 1
        segment.color = PIE_CHART_COLORS[Math.round(lightest - step * (lightest - darkest))]
      })
    }

    if (othersTotal > 0) {
      majorSegments.push({
        name: "Others",
        y: othersTotal,
        color: PIE_CHART_COLORS[PIE_CHART_COLORS.length - 1],
      })
    }

    return majorSegments
  }, [safeData, dataKey, total, order])

  const options = React.useMemo<Options>(() => {
    return {
      chart: {
        type: "pie",
        backgroundColor: "transparent",
      },
      title: { text: undefined },
      credits: { enabled: false },
      accessibility: {
        enabled: true,
        landmarkVerbosity: "one",
        description: `${title}. ${seriesData.length} segments. ${countLabel} total ${total.toLocaleString()}.`,
        point: {
          valueDescriptionFormat: "{xDescription}. {point.y} {series.name}.",
        },
      },
      legend: {
        enabled: false,
      },
      tooltip: {
        useHTML: true,
        backgroundColor: "transparent",
        borderWidth: 0,
        shadow: false,
        formatter: function () {
          const point = this as unknown as Point
          const value = typeof point.y === "number" ? point.y : 0
          const percent = total > 0 ? Math.round((value / total) * 100) : 0
          const color = point.color || PIE_CHART_COLORS[0]
          return `
            <div class="rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
              <p class="text-sm font-semibold text-foreground mb-2">${point.name}</p>
              <div class="space-y-1">
                <p class="text-xs text-muted-foreground">
                  ${countLabel}: <span class="font-medium text-foreground" style="color:${color}">${Number(value).toLocaleString()}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                  ${showBigPercentage ? `<span class="text-2xl font-bold" style="color:${color}">${percent}%</span>` : `<span class="font-medium" style="color:${color}">${percent}%</span>`}
                </p>
              </div>
            </div>
          `
        },
      },
      plotOptions: {
        pie: {
          innerSize: "65%",
          size: "68%",
          dataLabels: {
            enabled: labelDisplay.showCategoryLabels || labelDisplay.showPercentages,
            distance: 12,
            // Highcharts already spreads pie labels apart; its extra overlap
            // check is conservative and hid labels that did not touch.
            allowOverlap: true,
            connectorWidth: 1,
            connectorColor: "hsl(var(--border))",
            style: {
              color: "hsl(var(--foreground))",
              fontSize: "11px",
              fontWeight: "600",
              fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
              textOutline: "none",
              // One line per label: a wrapped label is twice as tall and
              // crowds its neighbours (names are shortened in the formatter).
              whiteSpace: "nowrap",
            },
            formatter: function () {
              const point = this as unknown as Point
              const value = typeof point.y === "number" ? point.y : 0
              if (value <= 0 || total <= 0) return ""
              const percent = Math.round((value / total) * 100)
              return formatPieChartDataLabel(point.name, percent, labelDisplay)
            },
          },
          showInLegend: false,
          borderWidth: 1,
          borderColor: "hsl(var(--background))",
          point: {
            events: {
              click: function () {
                const point = this as Point
                captureEvent(ANALYTICS_EVENTS.CHART_SLICE_CLICKED, {
                  chart_title: title,
                  segment_name: point.name,
                  segment_value: point.y ?? 0,
                })
              },
            },
          },
        },
      },
      series: [
        {
          type: "pie",
          name: countLabel,
          data: seriesData,
        },
      ],
      responsive: {
        rules: [
          {
            // On narrow charts a name plus percentage gets trimmed to "IT: …",
            // losing the number; show only the percentage (the tooltip has the name).
            condition: { maxWidth: 420 },
            chartOptions: {
              plotOptions: {
                pie: {
                  dataLabels: {
                    formatter: function () {
                      const point = this as unknown as Point
                      const value = typeof point.y === "number" ? point.y : 0
                      if (value <= 0 || total <= 0) return ""
                      const percent = Math.round((value / total) * 100)
                      return formatPieChartDataLabel(point.name, percent, {
                        showCategoryLabels: labelDisplay.showCategoryLabels && !labelDisplay.showPercentages,
                        showPercentages: labelDisplay.showPercentages,
                      })
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }
  }, [seriesData, total, countLabel, showBigPercentage, title, labelDisplay])

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <RiPieChartLine className="h-4 w-4 text-[hsl(var(--chart-1))]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[400px] w-full">
            <ChartWaveSkeleton />
          </div>
        ) : safeData.length > 0 ? (
          chartLib ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  className="h-[400px] w-full"
                  aria-label={`${title} chart. Right-click for data label options.`}
                >
                  <chartLib.HighchartsReact
                    highcharts={chartLib.Highcharts}
                    options={options}
                    containerProps={{ style: { height: "100%", width: "100%" } }}
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuLabel>Data labels</ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem
                  role="menuitemcheckbox"
                  aria-checked={labelDisplay.showCategoryLabels}
                  onSelect={(event) => {
                    event.preventDefault()
                    onLabelDisplayChange({
                      ...labelDisplay,
                      showCategoryLabels: !labelDisplay.showCategoryLabels,
                    })
                  }}
                >
                  <Checkbox
                    checked={labelDisplay.showCategoryLabels}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                  Category labels
                </ContextMenuItem>
                <ContextMenuItem
                  role="menuitemcheckbox"
                  aria-checked={labelDisplay.showPercentages}
                  onSelect={(event) => {
                    event.preventDefault()
                    onLabelDisplayChange({
                      ...labelDisplay,
                      showPercentages: !labelDisplay.showPercentages,
                    })
                  }}
                >
                  <Checkbox
                    checked={labelDisplay.showPercentages}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none"
                  />
                  Percentages
                </ContextMenuItem>
                <ContextMenuSeparator />
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Applies to all pie charts
                </p>
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            <div className="h-[400px] w-full">
              <ChartWaveSkeleton />
            </div>
          )
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
PieChartCard.displayName = "PieChartCard"
