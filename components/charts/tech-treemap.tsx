"use client"

import React, { memo } from "react"
import { RiStackLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { ChartWaveSkeleton } from "@/components/ui/chart-wave-skeleton"
import { PIE_CHART_COLORS } from "@/lib/utils/chart-helpers"
import type { Tech } from "@/lib/types"
import type { Options, Point } from "highcharts"

type TreemapNode = {
  id: string
  parent?: string
  name: string
  value?: number
  color?: string
  // Not "category": Highcharts overwrites point.category with an axis index.
  categoryName?: string
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

  // Highcharts keeps the tooltip while the pointer rests and the dialog scrolls
  // underneath it, so it lingered on the wrong tile. Hide it on any scroll.
  const chartRef = React.useRef<{ chart?: { tooltip?: { hide: (delay?: number) => void } } } | null>(null)
  React.useEffect(() => {
    const hideTooltip = () => chartRef.current?.chart?.tooltip?.hide(0)
    window.addEventListener("scroll", hideTooltip, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", hideTooltip, { capture: true })
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
          categoryName: category,
          color: hexToRgba(categoryColor, 0.85),
        })
      })
    })

    return nodes
  }, [tech])

  const toolCount = React.useMemo(() => data.filter((node) => node.parent).length, [data])


  if (data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 text-muted-foreground", heightClass)}>
        <RiStackLine className="h-5 w-5" />
        <p className="text-sm">No tech stack data available</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-0">
      {showTitle && (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
          <RiStackLine className="h-4 w-4" />
          {title}
        </div>
      )}
      <div className={cn("w-full h-full min-h-0", heightClass)}>
        {chartLib ? (
          <chartLib.HighchartsReact
            ref={chartRef}
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
            // Hidden when the card shows its own heading, but still names the chart region.
            title: showTitle
              ? { text: title, align: "left" }
              : { text: title, floating: true, style: { display: "none" } },
            credits: { enabled: false },
            navigation: {
              breadcrumbs: {
                enabled: false,
              },
            },
            accessibility: {
              enabled: true,
              landmarkVerbosity: "one",
              // Replaces the generated "Chart with N data points", which counted category nodes.
              typeDescription: "Treemap",
              description: `${title}. ${toolCount} ${toolCount === 1 ? "tool" : "tools"} in ${data.length - toolCount} ${data.length - toolCount === 1 ? "category" : "categories"}.`,
              point: {
                valueDescriptionFormat: "{point.name}, {point.value}.",
              },
            },
            tooltip: {
              useHTML: true,
              backgroundColor: "transparent",
              borderWidth: 0,
              shadow: false,
              // Every tool is weighted 1, so a share of the total means nothing (#350).
              // Show the tool and its category instead.
              formatter: function () {
                const point = this as unknown as Point & { name?: string; categoryName?: string }
                const name = point.name || "Unknown"
                return `
                  <div class="rounded-lg border border-border bg-background px-3 py-2 shadow-lg">
                    <p class="text-xs font-semibold text-foreground">${name}</p>
                    ${point.categoryName ? `<p class="text-xs text-muted-foreground">${point.categoryName}</p>` : ""}
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
                        const point = this as unknown as Point & { name?: string }
                        return point.name || ""
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
          <ChartWaveSkeleton />
        )}
      </div>
    </div>
  )
})

TechTreemap.displayName = "TechTreemap"

