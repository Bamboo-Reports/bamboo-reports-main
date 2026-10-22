import type { Center, Function, ChartData } from "../types"

// Professional pie-chart palette tuned for executive dashboards.
export const PIE_CHART_COLORS = [
  "#f17c1d",
  "#f28d2f",
  "#f29e42",
  "#f3ad55",
  "#f5bb69",
  "#f6c97e",
  "#f8d794",
  "#fbe4ab",
  "#fff0c2",
]

/**
 * Calculate chart data from accounts
 */
export const calculateChartData = <T>(items: T[], field: keyof T, limit = 10): ChartData[] => {
  const counts = new Map<string, number>()

  items.forEach((item) => {
    const value = String(item[field] ?? "") || "Unknown"
    counts.set(value, (counts.get(value) || 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit) // Top 10 by default for better readability
}

/**
 * Calculate chart data from centers
 */
export const calculateCenterChartData = (centers: Center[], field: keyof Center, limit = 10): ChartData[] => {
  const counts = new Map<string, number>()

  centers.forEach((center) => {
    const value = String(center[field] ?? "") || "Unknown"
    counts.set(value, (counts.get(value) || 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit) // Top 10 by default for better readability
}

/**
 * Calculate city chart data with top 5 + Others
 */
export const calculateCityChartData = (centers: Center[]): ChartData[] => {
  const counts = new Map<string, number>()

  centers.forEach((center) => {
    const city = center.center_city || "Unknown"
    counts.set(city, (counts.get(city) || 0) + 1)
  })

  const sorted = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Take top 5 and group the rest as "Others"
  if (sorted.length <= 5) {
    return sorted
  }

  const top5 = sorted.slice(0, 5)
  const others = sorted.slice(5).reduce((sum, item) => sum + item.value, 0)

  if (others > 0) {
    top5.push({ name: "Others", value: others })
  }

  return top5
}

/**
 * Calculate function chart data from centers
 */
export const calculateFunctionChartData = (
  functions: Function[],
  centerKeys: string[],
  limit = 10
): ChartData[] => {
  const counts = new Map<string, number>()
  const centerKeySet = new Set(centerKeys)

  functions.forEach((func) => {
    if (centerKeySet.has(func.cn_unique_key)) {
      const funcName = func.function_name || "Unknown"
      counts.set(funcName, (counts.get(funcName) || 0) + 1)
    }
  })

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit) // Top 10 by default for better readability
}

const RANGE_UNITS: Record<string, number> = { K: 1e3, Mn: 1e6, Bn: 1e9 }

/**
 * Lower bound of a bucket label ("<50" first, "10Mn - 50Mn" -> 10e6, ">50Bn" -> 50e9),
 * matching the table's range sort. Returns null for labels that are not ranges.
 */
export const rangeLowerBound = (label: string): number | null => {
  const text = label.trim()
  if (text.startsWith("<")) return -1
  const match = text.match(/^>?\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)/)
  if (!match) return null
  return Number(match[1]) * (RANGE_UNITS[match[2]] ?? 1)
}

/**
 * Chart segment order: range buckets in range order when every named segment is
 * a range, otherwise largest first. "Others" always goes last.
 */
export const orderChartSegments = <T extends { name: string; value: number }>(segments: T[]): T[] => {
  const isOthers = (segment: T) => segment.name.trim().toLowerCase() === "others"
  const named = segments.filter((segment) => !isOthers(segment))
  const others = segments.filter(isOthers)
  const bounds = named.map((segment) => rangeLowerBound(segment.name))
  const ordinal = named.length > 1 && bounds.every((bound) => bound !== null)
  const sorted = ordinal
    ? named
        .map((segment, index) => ({ segment, bound: bounds[index] as number }))
        .sort((a, b) => a.bound - b.bound)
        .map(({ segment }) => segment)
    : [...named].sort((a, b) => b.value - a.value)
  return [...sorted, ...others]
}
