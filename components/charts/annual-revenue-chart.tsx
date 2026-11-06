"use client"

import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"
import { cn } from "@/lib/utils"
import type { RevenueSeriesPoint } from "@/lib/types"

const chartConfig = {
  revenue: { label: "Revenue" },
} satisfies ChartConfig

export function formatRevenue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Column colours: the latest year in the deepest orange, earlier years stepping
 * paler toward the oldest.
 */
export function revenueColumnColor(index: number, count: number): string {
  const deepest = DONUT_CHART_COLORS.length - 1
  if (index === count - 1) return DONUT_CHART_COLORS[deepest]
  const earlier = count - 1
  if (earlier <= 1) return DONUT_CHART_COLORS[3]
  return DONUT_CHART_COLORS[1 + Math.round((index * 2) / (earlier - 1))]
}

/** Latest year's change against the year before, as a whole percent, or null. */
export function revenueChange(series: RevenueSeriesPoint[]): number | null {
  if (series.length < 2) return null
  const latest = series[series.length - 1].revenue
  const previous = series[series.length - 2].revenue
  if (!previous) return null
  return Math.round(((latest - previous) / Math.abs(previous)) * 100)
}

interface AnnualRevenueChartProps {
  series: RevenueSeriesPoint[]
  className?: string
}

export function AnnualRevenueChart({ series, className }: AnnualRevenueChartProps) {
  if (series.length === 0) return null

  const latest = series[series.length - 1]
  const previous = series.length > 1 ? series[series.length - 2] : null
  const change = revenueChange(series)
  const lastIndex = series.length - 1

  return (
    <div className={cn("rounded-xl border bg-card px-4 pb-2 pt-3", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-muted-foreground">Annual revenue</span>
        <span className="text-lg font-semibold tabular-nums">{formatRevenue(latest.revenue)}</span>
        {change !== null && previous && (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              change >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
            )}
          >
            {change >= 0 ? "+" : ""}
            {change}% <span className="font-normal text-muted-foreground">vs {previous.label}</span>
          </span>
        )}
      </div>
      <ChartContainer config={chartConfig} className="mt-1 h-[180px] w-full">
        <BarChart
          data={series}
          margin={{ left: 0, right: 0, top: 24, bottom: 0 }}
          barCategoryGap="22%"
          accessibilityLayer
        >
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tickMargin={8} />
          <Bar
            dataKey="revenue"
            radius={[4, 4, 0, 0]}
            maxBarSize={112}
            isAnimationActive={false}
          >
            {series.map((point, index) => (
              <Cell key={point.date} fill={revenueColumnColor(index, series.length)} />
            ))}
            <LabelList
              dataKey="revenue"
              position="top"
              content={({ x, y, width, value, index }) => {
                if (typeof value !== "number" || typeof x !== "number" || typeof y !== "number" || typeof width !== "number") {
                  return null
                }
                const isLatest = index === lastIndex
                return (
                  <text
                    x={x + width / 2}
                    y={y - 8}
                    textAnchor="middle"
                    className={cn(
                      "text-xs tabular-nums",
                      isLatest ? "fill-foreground font-semibold" : "fill-muted-foreground font-medium"
                    )}
                  >
                    {formatRevenue(value)}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
