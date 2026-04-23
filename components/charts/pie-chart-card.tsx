"use client"

import React, { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChartIcon } from "lucide-react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"
import type { ChartData } from "@/lib/types"
import type { Options, Point } from "highcharts"

interface PieChartCardProps {
  title: string
  data: ChartData[]
  dataKey?: string
  countLabel?: string
  showBigPercentage?: boolean
}

export const PieChartCard = memo(({ title, data, dataKey = "value", countLabel = "Count", showBigPercentage = false }: PieChartCardProps) => {
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
      const rawValue = (item as Record<string, number | undefined>)[dataKey]
      return sum + (typeof rawValue === "number" ? rawValue : 0)
    }, 0)
  }, [safeData, dataKey])

  const seriesData = React.useMemo(() => {
    const mappedData = safeData.map((item, index) => {
      const rawValue = (item as Record<string, number | undefined>)[dataKey]
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
      if (percent < OTHERS_THRESHOLD_PERCENT) {
        othersTotal += segment.y
      } else {
        majorSegments.push(segment)
      }
    })

    if (othersTotal > 0) {
      majorSegments.push({
        name: "Others",
        y: othersTotal,
        color: PIE_CHART_COLORS[PIE_CHART_COLORS.length - 1],
      })
    }

    return majorSegments
  }, [safeData, dataKey, total])

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
          const point = this.point as Point
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
            enabled: true,
            distance: 12,
            allowOverlap: false,
            connectorWidth: 1,
            connectorColor: "hsl(var(--border))",
            style: {
              color: "hsl(var(--foreground))",
              fontSize: "11px",
              fontWeight: "600",
              fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
              textOutline: "none",
            },
            formatter: function () {
              const point = this.point as Point
              const value = typeof point.y === "number" ? point.y : 0
              if (value <= 0 || total <= 0) return ""
              const percent = Math.round((value / total) * 100)
              return `${point.name}: ${percent}%`
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
    }
  }, [seriesData, total, countLabel, showBigPercentage, title])

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-[hsl(var(--chart-1))]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {safeData.length > 0 ? (
          <div className="h-[400px] w-full">
            {chartLib ? (
              <chartLib.HighchartsReact
                highcharts={chartLib.Highcharts}
                options={options}
                containerProps={{ style: { height: "100%", width: "100%" } }}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                Loading chart...
              </div>
            )}
          </div>
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
