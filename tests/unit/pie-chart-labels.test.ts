import { describe, expect, it } from "vitest"
import {
  formatPieChartDataLabel,
  type PieChartLabelDisplay,
} from "@/components/charts/pie-chart-card"

describe("pie chart data labels", () => {
  const cases: Array<[string, PieChartLabelDisplay, string]> = [
    [
      "category and percentage",
      { showCategoryLabels: true, showPercentages: true },
      "India: 42%",
    ],
    [
      "category only",
      { showCategoryLabels: true, showPercentages: false },
      "India",
    ],
    [
      "percentage only",
      { showCategoryLabels: false, showPercentages: true },
      "42%",
    ],
    [
      "neither",
      { showCategoryLabels: false, showPercentages: false },
      "",
    ],
  ]

  it.each(cases)("formats %s", (_name, display, expected) => {
    expect(formatPieChartDataLabel("India", 42, display)).toBe(expected)
  })
})
