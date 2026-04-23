"use client"

import React, { memo } from "react"
import { Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"
import type { Tech } from "@/lib/types"
import type { Options, Point } from "highcharts"

type TreemapNode = {
  id: string
  parent?: string
  name: string
  value?: number
  color?: string
  category?: string
  count?: number
}

interface TechTreemapProps {
  tech: Tech[]
  title?: string
  heightClass?: string
  showTitle?: boolean
}

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace("#", "")
  const bigint = Number.parseInt(sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const TechTreemap = memo(({
  tech,
  title = "Tech Stack",
  heightClass = "h-[320px] lg:h-[420px]",
  showTitle = true,
}: TechTreemapProps) => {
  const [chartLib, setChartLib] = React.useState<{
    Highcharts: typeof import("highcharts")
    HighchartsReact: React.ComponentType<any>
  } | null>(null)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      const highchartsModule = await import("highcharts")
      const Highcharts = (highchartsModule as any).default ?? highchartsModule
      const treemapModule = await import("highcharts/modules/treemap")
      const HighchartsTreemap = (treemapModule as any).default ?? treemapModule
      if (typeof HighchartsTreemap === "function") {
        HighchartsTreemap(Highcharts)
      }
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

  const data = React.useMemo<TreemapNode[]>(() => {
    const categoryMap = new Map<string, Map<string, number>>()

    tech.forEach((item) => {
      const category = item.software_category?.trim() || "Uncategorized"
      const software = item.software_in_use?.trim() || "Unknown"

      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map())
      }

      const softwareMap = categoryMap.get(category)!
      softwareMap.set(software, (softwareMap.get(software) || 0) + 1)
    })

    const nodes: TreemapNode[] = []
    Array.from(categoryMap.entries()).forEach(([category, softwareMap], index) => {
      const categoryColor = PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]
      const categoryId = `cat-${index}`
      nodes.push({
        id: categoryId,
        name: category,
        color: categoryColor,
      })

      Array.from(softwareMap.entries()).forEach(([software, count], softwareIndex) => {
        nodes.push({
          id: `${categoryId}-${softwareIndex}`,
          parent: categoryId,
          name: software,
          value: count,
          count,
          category,
          color: hexToRgba(categoryColor, 0.85),
        })
      })
    })

    return nodes
  }, [tech])

  const totalLeafValue = React.useMemo(
    () => data.reduce((sum, node) => sum + (typeof node.value === "number" ? node.value : 0), 0),
    [data]
  )

  if (data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 text-muted-foreground", heightClass)}>
        <Layers className="h-5 w-5" />
        <p className="text-sm">No tech stack data available</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-0">
      {showTitle && (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
          <Layers className="h-4 w-4" />
          {title}
        </div>
      )}
      <div className={cn("w-full h-full min-h-0", heightClass)}>
        {chartLib ? (
          <chartLib.HighchartsReact
            highcharts={chartLib.Highcharts}
            options={{
            chart: {
              type: "treemap",
              backgroundColor: "transparent",
              spacing: [0, 0, 0, 0],
              margin: [0, 0, 0, 0],
              style: {
                fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              },
            },
            title: { text: showTitle ? title : undefined, align: "left" },
            credits: { enabled: false },
            navigation: {
              breadcrumbs: {
                enabled: false,
              },
            },
            accessibility: {
              enabled: true,
              landmarkVerbosity: "one",
              description: `${title}. Treemap showing ${data.length} technology nodes grouped by category.`,
              point: {
                valueDescriptionFormat: "{point.name}, {point.value}.",
              },
            },
            tooltip: {
              useHTML: true,
              backgroundColor: "transparent",
              borderWidth: 0,
              shadow: false,
              formatter: function () {
                const point = this.point as Point & { count?: number; value?: number; name?: string }
                const softwareName = point.name || "Unknown"
                const value = typeof point.value === "number"
                  ? point.value
                  : (typeof point.count === "number" ? point.count : 0)
                const percent = totalLeafValue > 0 ? (value / totalLeafValue) * 100 : 0
                const roundedPercent = Math.round(percent * 10) / 10
                const percentText = Number.isInteger(roundedPercent)
                  ? `${roundedPercent.toFixed(0)}%`
                  : `${roundedPercent.toFixed(1)}%`
                return `
                  <div class="rounded-lg border border-border bg-background px-3 py-2 shadow-lg">
                    <p class="text-xs font-semibold text-foreground">${softwareName}</p>
                    ${value > 0 ? `<p class="text-sm font-semibold text-foreground">${percentText}</p>` : ""}
                  </div>
                `
              },
            },
            plotOptions: {
              treemap: {
                layoutAlgorithm: "squarified",
                allowTraversingTree: true,
                alternateStartingDirection: true,
                borderColor: "var(--treemap-border-color)",
                borderWidth: 1,
                dataLabels: {
                  format: "{point.name}",
                  style: {
                    textOutline: "none",
                  },
                },
                borderRadius: 3,
                nodeSizeBy: "leaf",
              },
            },
            series: [
              {
                type: "treemap",
                name: "Tech Stack",
                data,
                breadcrumbs: {
                  showFullPath: true,
                  formatter: function (this: { level?: { levelOptions?: { name?: string } } }) {
                    return this.level?.levelOptions?.name || ""
                  },
                  style: {
                    color: "hsl(var(--foreground))",
                    fill: "hsl(var(--foreground))",
                  },
                  buttonTheme: {
                    fill: "transparent",
                    "stroke-width": 0,
                    style: {
                      color: "hsl(var(--foreground))",
                      fill: "hsl(var(--foreground))",
                    },
                    states: {
                      hover: {
                        fill: "transparent",
                        style: {
                          color: "hsl(var(--foreground))",
                          fill: "hsl(var(--foreground))",
                        },
                      },
                      select: {
                        fill: "transparent",
                        style: {
                          color: "hsl(var(--foreground))",
                          fill: "hsl(var(--foreground))",
                        },
                      },
                    },
                  },
                  separator: {
                    style: {
                      color: "hsl(var(--muted-foreground))",
                      fill: "hsl(var(--muted-foreground))",
                    },
                  },
                },
                levels: [
                  {
                    level: 1,
                    layoutAlgorithm: "sliceAndDice",
                    groupPadding: 3,
                    dataLabels: {
                      headers: true,
                      enabled: true,
                      style: {
                        fontSize: "0.6em",
                        fontWeight: "normal",
                        color: "var(--highcharts-neutral-color-100, hsl(var(--foreground)))",
                        textOutline: "none",
                      },
                    },
                    borderRadius: 3,
                    colorByPoint: true,
                  },
                  {
                    level: 2,
                    dataLabels: {
                      enabled: true,
                      inside: false,
                      formatter: function () {
                        const point = this.point as Point & { value?: number; name?: string }
                        const softwareName = point.name || ""
                        const value = typeof point.value === "number" ? point.value : 0
                        if (totalLeafValue <= 0) {
                          return softwareName
                        }
                        const percent = (value / totalLeafValue) * 100
                        const roundedPercent = Math.round(percent * 10) / 10
                        const percentText = Number.isInteger(roundedPercent)
                          ? `${roundedPercent.toFixed(0)}%`
                          : `${roundedPercent.toFixed(1)}%`
                        return `${softwareName}<br/>${percentText}`
                      },
                    },
                  },
                ],
              },
            ],
          } as Options}
            containerProps={{ style: { height: "100%", width: "100%" } }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            Loading chart...
          </div>
        )}
      </div>
    </div>
  )
})

TechTreemap.displayName = "TechTreemap"

