"use client"

import React, { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiInformationLine, RiPieChartLine } from "@remixicon/react"
import { HintTooltip } from "@/components/ui/tooltip"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"
import { HIGHCHARTS_TOOLTIP_BASE, chartTooltipHtml } from "@/lib/tooltip/markup"
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

// Long names break onto a second line at a space. A name that still does not
// fit in two lines is shortened at the end (the tooltip shows it in full).
const LABEL_LINE_LENGTH = 18
const MAX_LABEL_NAME_LINES = 2

const shortenLine = (text: string) =>
  text.length > LABEL_LINE_LENGTH
    ? `${text.slice(0, LABEL_LINE_LENGTH - 1).trimEnd()}…`
    : text

export function wrapPieChartLabelName(name: string): string[] {
  const lines: string[] = []
  let current = ""
  for (const word of name.trim().split(/\s+/)) {
    if (!current) {
      current = word
    } else if (`${current} ${word}`.length <= LABEL_LINE_LENGTH) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  const kept = lines.slice(0, MAX_LABEL_NAME_LINES - 1)
  const rest = lines.slice(MAX_LABEL_NAME_LINES - 1).join(" ")
  if (rest) kept.push(rest)
  return kept.map(shortenLine)
}

/**
 * What a screen reader announces for a slice, such as "Under 50: 15%, 382 accounts".
 * Highcharts strips anything that looks like an HTML tag from these descriptions,
 * which erased slices named "<50", so range bounds are spoken as words and any
 * other "<" is kept apart from the text after it.
 */
export function describePieSlice(name: string, value: number, total: number, unit: string): string {
  const spokenName = name
    .trim()
    .replace(/^<\s*/, "Under ")
    .replace(/^>\s*/, "Over ")
    .replace(/<(?=\S)/g, "< ")
  const percent = total > 0 ? Math.round((value / total) * 100) : 0
  return `${spokenName}: ${percent}%, ${value.toLocaleString("en-US")} ${unit.toLowerCase()}`
}

export interface PieChartLabelParts {
  share: string | null
  /** The name, already broken into lines. */
  nameLines: string[] | null
}

/** The parts of a slice label: the share on top, the name underneath. */
export function getPieChartLabelParts(
  categoryName: string,
  percent: number,
  display: PieChartLabelDisplay
): PieChartLabelParts {
  return {
    share: display.showPercentages ? `${percent}%` : null,
    nameLines: display.showCategoryLabels ? wrapPieChartLabelName(categoryName) : null,
  }
}

const escapeLabelText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Highcharts turns these spans into SVG tspans. The share leads in full ink;
// the name sits under it in muted grey. "Others" is the leftover group, so its
// share is muted too.
function renderPieChartLabel({ share, nameLines }: PieChartLabelParts, isOthers: boolean) {
  const shareColor = isOthers ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))"
  const lines: string[] = []
  if (share) {
    lines.push(
      `<span style="font-size:14px;font-weight:600;color:${shareColor}">${share}</span>`
    )
  }
  const nameStyle = share
    ? "font-weight:400;color:hsl(var(--muted-foreground))"
    : "font-weight:500;color:hsl(var(--foreground))"
  for (const line of nameLines ?? []) {
    lines.push(`<span style="${nameStyle}">${escapeLabelText(line)}</span>`)
  }
  return lines.join("<br/>")
}

const OTHERS_COLOR = DONUT_CHART_COLORS[0]

/**
 * Spread `count` slices over the colour steps from `firstStep` to the deepest,
 * so a short list still runs from pale to deep. `index` 0 gets the palest.
 */
function donutStep(index: number, count: number, firstStep: number) {
  const last = DONUT_CHART_COLORS.length - 1
  if (count <= 1) return DONUT_CHART_COLORS[last]
  return DONUT_CHART_COLORS[firstStep + Math.round((index * (last - firstStep)) / (count - 1))]
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/**
 * A colour `t` (0 to 1) of the way along the ramp, blending neighbouring steps,
 * so a range chart with more buckets than steps never repeats a colour.
 */
export function donutRampColor(t: number): string {
  const steps = DONUT_CHART_COLORS.length - 1
  const position = Math.min(Math.max(t, 0), 1) * steps
  const lower = Math.floor(position)
  if (lower >= steps) return DONUT_CHART_COLORS[steps]
  const a = hexToRgb(DONUT_CHART_COLORS[lower])
  const b = hexToRgb(DONUT_CHART_COLORS[lower + 1])
  const mix = position - lower
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * mix).toString(16).padStart(2, "0")).join("")}`
}

interface PieChartCardProps {
  title: string
  /** Value sent as chart_title in analytics, when it differs from the shown title. */
  analyticsTitle?: string
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
  /** A short note on how to read the chart, behind an info icon next to the title. */
  note?: string
  /** Display form of a slice name (sorting still uses the raw name). Keep it stable. */
  formatName?: (name: string) => string
}

export const PieChartCard = memo(({
  title,
  analyticsTitle,
  data,
  dataKey = "value",
  countLabel = "Count",
  showBigPercentage = false,
  labelDisplay,
  onLabelDisplayChange,
  loading = false,
  order = "size",
  note,
  formatName,
}: PieChartCardProps) => {
  const OTHERS_THRESHOLD_PERCENT = 5
  // "Total accounts" reads as "Accounts: 1,184" in the tooltip.
  const countLineLabel = React.useMemo(() => {
    const label = countLabel.replace(/^total\s+/i, "")
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [countLabel])
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
    const mappedData = safeData.map((item) => {
      const rawValue = (item as unknown as Record<string, number | undefined>)[dataKey]
      return {
        name: item.name,
        y: typeof rawValue === "number" ? rawValue : 0,
        // Set from the slice's rank below, unless the data brings its own fill.
        color: item.fill ?? "",
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
      // Range charts keep every bucket so the scale stays in order.
      const isSmall = order !== "range" && percent < OTHERS_THRESHOLD_PERCENT
      if (isSmall || segment.name === "Others") {
        othersTotal += segment.y
      } else {
        majorSegments.push(segment)
      }
    })

    // The palest step belongs to "Others"; without it, range charts may use it.
    const hasOthers = othersTotal > 0
    const count = majorSegments.length
    if (order === "range") {
      // Still the largest buckets, shown in range order from pale to deep.
      majorSegments.sort((a, b) => compareRangeLabels(a.name, b.name))
      // Pale to deep along the ramp; the palest step stays for "Others" when present.
      const start = hasOthers ? 1 / (DONUT_CHART_COLORS.length - 1) : 0
      majorSegments.forEach((segment, index) => {
        segment.color ||= donutRampColor(count <= 1 ? 1 : start + ((1 - start) * index) / (count - 1))
      })
    } else {
      // Largest first, clockwise from 12 o'clock; the largest gets the deepest orange.
      majorSegments.sort((a, b) => b.y - a.y)
      majorSegments.forEach((segment, index) => {
        segment.color ||= donutStep(count - 1 - index, count, 1)
      })
    }

    if (hasOthers) {
      majorSegments.push({
        name: "Others",
        y: othersTotal,
        color: OTHERS_COLOR,
      })
    }

    // The stored bucket rides along so analytics keep reporting it, not the display label.
    return formatName
      ? majorSegments.map((segment) =>
          segment.name === "Others" ? segment : { ...segment, name: formatName(segment.name), custom: { rawName: segment.name } }
        )
      : majorSegments
  }, [safeData, dataKey, total, order, formatName])

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
        description: `${title}. ${seriesData.length} segments. ${countLabel} total ${total.toLocaleString()}.${note ? ` ${note}.` : ""}`,
        point: {
          descriptionFormatter: (point) =>
            describePieSlice(String(point.name ?? ""), typeof point.y === "number" ? point.y : 0, total, countLineLabel),
        },
      },
      legend: {
        enabled: false,
      },
      tooltip: {
        ...HIGHCHARTS_TOOLTIP_BASE,
        formatter: function () {
          const point = this as unknown as Point
          const value = typeof point.y === "number" ? point.y : 0
          const percent = total > 0 ? Math.round((value / total) * 100) : 0
          const share = `${percent}%`
          const count = { label: countLineLabel, value: Number(value).toLocaleString("en-US") }
          // Name, then the share as the large figure, then the count. Figures stay
          // in the text colour; the swatch carries the slice's colour.
          return chartTooltipHtml({
            title: point.name,
            swatch: typeof point.color === "string" ? point.color : undefined,
            lead: showBigPercentage ? share : undefined,
            lines: showBigPercentage ? [count] : [count, { label: "Share", value: share }],
          })
        },
      },
      plotOptions: {
        pie: {
          // A thin ring with an empty centre.
          innerSize: "75%",
          size: "62%",
          startAngle: 0,
          dataLabels: {
            enabled: labelDisplay.showCategoryLabels || labelDisplay.showPercentages,
            // Labels stand in one column per side, each joined to its slice by
            // a short bent connector.
            alignTo: "connectors",
            connectorShape: "crookedLine",
            distance: 16,
            connectorPadding: 4,
            // Highcharts already spreads pie labels apart; its extra overlap
            // check is conservative and hid labels that did not touch.
            allowOverlap: true,
            connectorWidth: 1,
            connectorColor: "hsl(var(--muted-foreground) / 0.45)",
            style: {
              color: "hsl(var(--foreground))",
              fontSize: "12px",
              fontWeight: "400",
              fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
              textOutline: "none",
              // Lines break only where the formatter puts a <br/> (long names are wrapped there).
              whiteSpace: "nowrap",
            },
            formatter: function () {
              const point = this as unknown as Point
              const value = typeof point.y === "number" ? point.y : 0
              if (value <= 0 || total <= 0) return ""
              const percent = Math.round((value / total) * 100)
              return renderPieChartLabel(
                getPieChartLabelParts(point.name, percent, labelDisplay),
                point.name === "Others"
              )
            },
          },
          showInLegend: false,
          // A 2px gap in the card colour keeps neighbouring slices apart.
          borderWidth: 2,
          borderColor: "hsl(var(--card))",
          // Hovering brightens the slice a touch. The others are not dimmed: a
          // dimmed orange turns muddy brown on the dark background.
          inactiveOtherPoints: false,
          states: {
            hover: { halo: { size: 0 }, brightness: 0.08 },
            inactive: { opacity: 1 },
          },
          point: {
            events: {
              click: function () {
                const point = this as Point
                captureEvent(ANALYTICS_EVENTS.CHART_SLICE_CLICKED, {
                  chart_title: analyticsTitle ?? title,
                  segment_name: (point.options.custom?.rawName as string | undefined) ?? point.name,
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
            // On narrow charts there is no room for a name under every share;
            // show only the percentage (the tooltip has the name).
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
                      return renderPieChartLabel(
                        getPieChartLabelParts(point.name, percent, {
                          showCategoryLabels: labelDisplay.showCategoryLabels && !labelDisplay.showPercentages,
                          showPercentages: labelDisplay.showPercentages,
                        }),
                        point.name === "Others"
                      )
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }
  }, [seriesData, total, countLabel, countLineLabel, showBigPercentage, title, analyticsTitle, labelDisplay, note])

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <RiPieChartLine className="h-4 w-4 text-muted-foreground" />
          {title}
          {note && (
            <HintTooltip label="How to read this chart" hint={note}>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RiInformationLine className="h-4 w-4" aria-hidden />
              </button>
            </HintTooltip>
          )}
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
                    // The label columns sit at the chart's edges, so a capped width keeps
                    // the connector lines short on wide cards.
                    containerProps={{
                      style: { height: "100%", width: "100%", maxWidth: 520, margin: "0 auto" },
                    }}
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
          // Same height as the chart, so the card does not shrink in the grid.
          <div className="flex h-[400px] flex-col items-center justify-center gap-1 text-center">
            <RiPieChartLine className="mb-1 h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">No {countLineLabel.toLowerCase()} to show</p>
            <p className="text-xs text-muted-foreground">None match the current filters</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
PieChartCard.displayName = "PieChartCard"
