"use client"

import React, { memo } from "react"
import { RiStackLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { ChartWaveSkeleton } from "@/components/ui/chart-wave-skeleton"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"
import {
  TECH_TREEMAP_SIZING,
  fitTechTreemapHeight,
  formatTechShare,
  groupTechByCategory,
  layoutTechTreemap,
  techShadeIndex,
  tileLineCount,
  wrappedLineCount,
  type TreemapTile,
} from "@/lib/charts/tech-treemap-layout"
import type { Tech } from "@/lib/types"

interface TechTreemapProps {
  tech: Tech[]
  title?: string
  className?: string
}

// Space between the panel's border and the trays (trays add their own 2px inset).
const PANEL_PADDING = 2
// One dark ink on every orange step (4.6:1 or better), so labels never switch colour.
const TILE_INK = "#33190a"

/** Measures tile names in the page's real font (13px, weight 500). */
function useTextMeasurer(element: HTMLElement | null, fontsReady: boolean) {
  return React.useMemo(() => {
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d")
    if (!context || !element) return (text: string) => text.length * 7
    context.font = `500 13px ${getComputedStyle(element).fontFamily}`
    return (text: string) => context.measureText(text).width
    // Re-measure once the web font has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, fontsReady])
}

/**
 * The tech stack as a treemap: one grey tray per category, busiest first, with
 * its tools as tiles sized and shaded by how many centres use them. The box is
 * as tall as it needs for the names to fit, up to a ceiling.
 */
export const TechTreemap = memo(({ tech, title = "Technology stack", className }: TechTreemapProps) => {
  const [panel, setPanel] = React.useState<HTMLDivElement | null>(null)
  const [width, setWidth] = React.useState(0)
  const [fontsReady, setFontsReady] = React.useState(false)
  const [hovered, setHovered] = React.useState<{ index: number; x: number; y: number } | null>(null)
  const tipRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let active = true
    document.fonts?.ready.then(() => active && setFontsReady(true))
    return () => {
      active = false
    }
  }, [])

  // The height depends on the width, so track the panel's inner width.
  React.useEffect(() => {
    if (!panel) return
    const update = () => setWidth(Math.max(0, panel.clientWidth - PANEL_PADDING * 2))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [panel])

  const textWidth = useTextMeasurer(panel, fontsReady)
  const categories = React.useMemo(() => groupTechByCategory(tech), [tech])
  const totalEntries = React.useMemo(() => categories.reduce((sum, c) => sum + c.total, 0), [categories])
  const toolCount = React.useMemo(() => categories.reduce((sum, c) => sum + c.tools.length, 0), [categories])
  const maxCount = React.useMemo(
    () => Math.max(1, ...categories.flatMap((c) => c.tools.map((tool) => tool.count))),
    [categories]
  )

  const height = React.useMemo(
    () => (width > 0 ? fitTechTreemapHeight(categories, width, textWidth) : TECH_TREEMAP_SIZING.minHeight),
    [categories, width, textWidth]
  )
  const { trays, tiles } = React.useMemo(
    () => (width > 0 ? layoutTechTreemap(categories, width, height) : { trays: [], tiles: [] }),
    [categories, width, height]
  )

  // Wrap a name at spaces only when it needs more than one line, every word fits
  // and the tile has room; otherwise one line ending in an ellipsis.
  const labelLines = (tile: TreemapTile) => {
    const inner = tile.width - TECH_TREEMAP_SIZING.tilePadding * 2
    if (textWidth(tile.name) <= inner) return 1
    const needed = wrappedLineCount(tile.name, inner, textWidth)
    return Number.isFinite(needed) ? tileLineCount(tile.height) : 1
  }

  // Keep the hover card inside the panel, flipping above the pointer near the bottom.
  React.useLayoutEffect(() => {
    const tip = tipRef.current
    if (!tip || !hovered || !panel) return
    const maxX = panel.clientWidth - tip.offsetWidth - 8
    const below = hovered.y + 16
    tip.style.left = `${Math.max(8, Math.min(hovered.x + 12, maxX))}px`
    tip.style.top = `${below + tip.offsetHeight > panel.clientHeight ? hovered.y - tip.offsetHeight - 12 : below}px`
  }, [hovered, panel])

  if (categories.length === 0) {
    return (
      <div className={cn("flex h-[152px] flex-col items-center justify-center gap-2 text-muted-foreground", className)}>
        <RiStackLine className="h-5 w-5" />
        <p className="text-sm">No tech stack data available</p>
      </div>
    )
  }

  const hoveredTile = hovered ? tiles[hovered.index] : null

  return (
    <div
      ref={setPanel}
      className={cn("relative w-full overflow-hidden rounded-xl border bg-card", className)}
      style={{ padding: PANEL_PADDING }}
      onPointerLeave={() => setHovered(null)}
    >
      {width === 0 ? (
        <div style={{ height }}>
          <ChartWaveSkeleton />
        </div>
      ) : (
        <div className="relative" style={{ height }} aria-hidden="true">
          {trays.map((tray) => (
            <div
              key={tray.name}
              className="absolute rounded-lg bg-muted/70"
              style={{ left: tray.x, top: tray.y, width: tray.width, height: tray.height }}
            >
              <p
                className="truncate px-3 text-xs font-medium text-muted-foreground"
                style={{ lineHeight: `${TECH_TREEMAP_SIZING.headerHeight}px` }}
              >
                {tray.name}
              </p>
            </div>
          ))}
          {tiles.map((tile, index) => {
            const lines = labelLines(tile)
            const isHovered = hovered?.index === index
            return (
              <div
                key={`${tile.category}-${tile.name}`}
                className={cn(
                  "absolute overflow-hidden rounded p-2 transition-shadow duration-100",
                  isHovered && "shadow-[inset_0_0_0_2px_hsl(var(--foreground)/0.85)]"
                )}
                style={{
                  left: tile.x,
                  top: tile.y,
                  width: tile.width,
                  height: tile.height,
                  background: DONUT_CHART_COLORS[techShadeIndex(tile.count, maxCount)],
                  color: TILE_INK,
                }}
                onPointerMove={(event) => {
                  const rect = event.currentTarget.offsetParent?.getBoundingClientRect()
                  if (!rect) return
                  setHovered({ index, x: event.clientX - rect.left, y: event.clientY - rect.top })
                }}
              >
                <span
                  className={cn(
                    "block text-[13px] font-medium leading-4",
                    lines > 1 ? "line-clamp-[var(--lines)] whitespace-normal" : "truncate"
                  )}
                  style={{ "--lines": lines } as React.CSSProperties}
                >
                  {tile.name}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {hoveredTile && (
        <div
          ref={tipRef}
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-float"
          aria-hidden="true"
        >
          <p className="text-sm font-medium text-foreground">{hoveredTile.name}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatTechShare(hoveredTile.count, totalEntries)}</p>
        </div>
      )}

      {/* The same content for screen readers, as a list instead of a picture. */}
      <div className="sr-only">
        <p>
          {title}: {toolCount} tools in {categories.length} categories.
        </p>
        <ul>
          {categories.map((category) => (
            <li key={category.name}>
              {category.name}:{" "}
              {category.tools.map((tool) => `${tool.name} (${formatTechShare(tool.count, totalEntries)})`).join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
})

TechTreemap.displayName = "TechTreemap"
