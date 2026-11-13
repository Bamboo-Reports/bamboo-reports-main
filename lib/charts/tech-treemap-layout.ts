import type { Tech } from "@/lib/types"

export interface TechTool {
  name: string
  /** Rows for this tool: on an account, the number of centres that use it. */
  count: number
}

export interface TechCategory {
  name: string
  tools: TechTool[]
  total: number
}

const byCountThenName = <T extends { name: string }>(count: (item: T) => number) =>
  (a: T, b: T) => count(b) - count(a) || a.name.localeCompare(b.name)

/** Groups tech rows into categories, busiest first; ties sort by name so the layout never shuffles. */
export function groupTechByCategory(tech: Tech[]): TechCategory[] {
  const categories = new Map<string, Map<string, number>>()
  for (const item of tech) {
    const category = item.software_category?.trim() || "Uncategorized"
    const tool = item.software_in_use?.trim() || "Unknown"
    const tools = categories.get(category) ?? new Map<string, number>()
    tools.set(tool, (tools.get(tool) ?? 0) + 1)
    categories.set(category, tools)
  }
  return Array.from(categories, ([name, tools]) => {
    const list = Array.from(tools, ([toolName, count]) => ({ name: toolName, count }))
      .sort(byCountThenName((tool) => tool.count))
    return { name, tools: list, total: list.reduce((sum, tool) => sum + tool.count, 0) }
  }).sort(byCountThenName((category) => category.total))
}

/**
 * Tile size follows the count, softened so a tool used at one centre is never
 * a sliver next to one used at seven.
 */
export const techTileWeight = (count: number) => count + 1

/**
 * Index into DONUT_CHART_COLORS for a tool: steps 1 to 5, deeper for tools used
 * at more centres. When every count is the same (a single centre), one middle step.
 */
export function techShadeIndex(count: number, maxCount: number): number {
  if (maxCount <= 1) return 3
  return 1 + Math.round(((count - 1) / (maxCount - 1)) * 4)
}

export type Rect = [x: number, y: number, width: number, height: number]

/** Squarified treemap layout (Bruls et al.); values sorted large to small, rects in the same order. */
export function squarify(values: number[], x: number, y: number, width: number, height: number): Rect[] {
  const sum = values.reduce((total, value) => total + value, 0)
  if (sum <= 0 || width <= 0 || height <= 0) return values.map(() => [x, y, 0, 0])
  const areas = values.map((value) => (value / sum) * width * height)
  const rects: Rect[] = []
  let row: number[] = []
  const worst = (r: number[], side: number) => {
    const total = r.reduce((a, b) => a + b, 0)
    return Math.max((side * side * Math.max(...r)) / (total * total), (total * total) / (side * side * Math.min(...r)))
  }
  const place = (r: number[]) => {
    const total = r.reduce((a, b) => a + b, 0)
    if (width >= height) {
      const columnWidth = total / height
      let cy = y
      for (const area of r) {
        rects.push([x, cy, columnWidth, area / columnWidth])
        cy += area / columnWidth
      }
      x += columnWidth
      width -= columnWidth
    } else {
      const rowHeight = total / width
      let cx = x
      for (const area of r) {
        rects.push([cx, y, area / rowHeight, rowHeight])
        cx += area / rowHeight
      }
      y += rowHeight
      height -= rowHeight
    }
  }
  let i = 0
  while (i < areas.length) {
    const side = Math.min(width, height)
    if (row.length === 0 || worst([...row, areas[i]], side) <= worst(row, side)) {
      row.push(areas[i++])
    } else {
      place(row)
      row = []
    }
  }
  if (row.length) place(row)
  return rects
}

export interface TreemapSizing {
  /** Inset of a category tray inside its cell: trays sit twice this apart. */
  trayInset: number
  /** Height of a category's name strip at the top of its tray. */
  headerHeight: number
  /** Inset of the tile area inside a tray (sides and bottom). */
  tileAreaInset: number
  /** Inset of a tile inside its cell: tiles sit twice this apart. */
  tileInset: number
  /** Padding inside a tile around its name. */
  tilePadding: number
  lineHeight: number
  maxLines: number
  minHeight: number
  maxHeight: number
}

export const TECH_TREEMAP_SIZING: TreemapSizing = {
  trayInset: 2,
  headerHeight: 24,
  tileAreaInset: 3,
  tileInset: 1,
  tilePadding: 8,
  lineHeight: 16,
  maxLines: 3,
  minHeight: 152,
  maxHeight: 760,
}

export interface TreemapTray {
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface TreemapTile {
  category: string
  name: string
  count: number
  x: number
  y: number
  width: number
  height: number
}

/** Positions every category tray and tool tile inside a `width` by `height` box. */
export function layoutTechTreemap(
  categories: TechCategory[],
  width: number,
  height: number,
  sizing: TreemapSizing = TECH_TREEMAP_SIZING
): { trays: TreemapTray[]; tiles: TreemapTile[] } {
  const { trayInset, headerHeight, tileAreaInset, tileInset } = sizing
  const trays: TreemapTray[] = []
  const tiles: TreemapTile[] = []
  // Laid out by weight, largest first, which is what squarify expects. The
  // incoming order is by total count, and that can differ: many small tools
  // outweigh one large one.
  const weighted = categories
    .map((category) => ({ category, weight: category.tools.reduce((sum, tool) => sum + techTileWeight(tool.count), 0) }))
    .sort((a, b) => b.weight - a.weight)
  const cells = squarify(weighted.map((entry) => entry.weight), 0, 0, width, height)
  cells.forEach(([cx, cy, cw, ch], index) => {
    const category = weighted[index].category
    const tray = { name: category.name, x: cx + trayInset, y: cy + trayInset, width: cw - trayInset * 2, height: ch - trayInset * 2 }
    trays.push(tray)
    squarify(
      category.tools.map((tool) => techTileWeight(tool.count)),
      tray.x + tileAreaInset,
      tray.y + headerHeight,
      tray.width - tileAreaInset * 2,
      tray.height - headerHeight - tileAreaInset
    ).forEach(([tx, ty, tw, th], toolIndex) => {
      const tool = category.tools[toolIndex]
      tiles.push({
        category: category.name,
        name: tool.name,
        count: tool.count,
        x: tx + tileInset,
        y: ty + tileInset,
        width: Math.max(0, tw - tileInset * 2),
        height: Math.max(0, th - tileInset * 2),
      })
    })
  })
  return { trays, tiles }
}

/** Lines a tile can show at `height`, from 1 up to `maxLines`. */
export function tileLineCount(height: number, sizing: TreemapSizing = TECH_TREEMAP_SIZING): number {
  return Math.max(1, Math.min(sizing.maxLines, Math.floor((height - sizing.tilePadding * 2) / sizing.lineHeight)))
}

/** Lines a name takes when wrapped at spaces into `width`, or Infinity if one word is wider. */
export function wrappedLineCount(name: string, width: number, textWidth: (text: string) => number): number {
  const space = textWidth(" ")
  let lines = 1
  let line = 0
  for (const word of name.split(" ")) {
    const wordWidth = textWidth(word)
    if (wordWidth > width) return Infinity
    if (line && line + space + wordWidth > width) {
      lines++
      line = wordWidth
    } else {
      line += (line ? space : 0) + wordWidth
    }
  }
  return lines
}

/** Whether a tile's name fits it, on one line or wrapped at spaces. */
export function tileNameFits(
  tile: Pick<TreemapTile, "name" | "width" | "height">,
  textWidth: (text: string) => number,
  sizing: TreemapSizing = TECH_TREEMAP_SIZING
): boolean {
  if (tile.height < sizing.tilePadding * 2 + sizing.lineHeight) return false
  return wrappedLineCount(tile.name, tile.width - sizing.tilePadding * 2, textWidth) <= tileLineCount(tile.height, sizing)
}

/**
 * The height at which every tool name fits its tile, starting from the space
 * the tools need and growing 8% at a time up to `maxHeight`. Past the ceiling,
 * names that still do not fit end in an ellipsis.
 */
export function fitTechTreemapHeight(
  categories: TechCategory[],
  width: number,
  textWidth: (text: string) => number,
  sizing: TreemapSizing = TECH_TREEMAP_SIZING
): number {
  const toolCount = categories.reduce((sum, category) => sum + category.tools.length, 0)
  if (toolCount === 0 || width <= 0) return sizing.minHeight

  const misfits = (height: number) => {
    const { trays, tiles } = layoutTechTreemap(categories, width, height, sizing)
    return (
      trays.filter((tray) => tray.width < 64 || tray.height < sizing.headerHeight + 32).length +
      tiles.filter((tile) => !tileNameFits(tile, textWidth, sizing)).length
    )
  }

  let height = Math.max(sizing.minHeight, Math.round((toolCount * 110 * 44) / width))
  while (height < sizing.maxHeight && misfits(height) > 0) {
    height = Math.min(sizing.maxHeight, Math.round(height * 1.08))
  }
  return Math.min(height, sizing.maxHeight)
}

/** A tool's share of every tool entry in the stack, as "5.5%" or "12%". */
export function formatTechShare(count: number, totalEntries: number): string {
  if (totalEntries <= 0) return "0%"
  const rounded = Math.round((count / totalEntries) * 1000) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}
