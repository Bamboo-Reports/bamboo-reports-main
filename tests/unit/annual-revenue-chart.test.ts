import { describe, expect, it } from "vitest"
import { formatRevenue, revenueChange, revenueColumnColor } from "@/components/charts/annual-revenue-chart"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"

const point = (label: string, revenue: number) => ({ date: label, label, revenue })

describe("annual revenue chart helpers", () => {
  it("formats figures compactly", () => {
    expect(formatRevenue(318_600_000_000)).toBe("318.6B")
    expect(formatRevenue(4_200_000)).toBe("4.2M")
  })

  it("gives the latest year's change against the year before", () => {
    expect(revenueChange([point("FY 2025", 281.7), point("FY 2026", 318.6)])).toBe(13)
    expect(revenueChange([point("FY 2025", 100), point("FY 2026", 90)])).toBe(-10)
    expect(revenueChange([point("FY 2026", 318.6)])).toBeNull()
    expect(revenueChange([point("FY 2025", 0), point("FY 2026", 5)])).toBeNull()
  })

  it("puts the latest year in the deepest orange and steps earlier years paler", () => {
    const colors = [0, 1, 2, 3].map((i) => revenueColumnColor(i, 4))
    expect(colors).toEqual([DONUT_CHART_COLORS[1], DONUT_CHART_COLORS[2], DONUT_CHART_COLORS[3], DONUT_CHART_COLORS[5]])
    expect(revenueColumnColor(0, 2)).toBe(DONUT_CHART_COLORS[3])
    expect(revenueColumnColor(0, 1)).toBe(DONUT_CHART_COLORS[5])
  })
})
