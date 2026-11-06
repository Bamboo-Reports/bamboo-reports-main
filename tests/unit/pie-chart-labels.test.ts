import { describe, expect, it } from "vitest"
import {
  getPieChartLabelParts,
  wrapPieChartLabelName,
  type PieChartLabelDisplay,
  type PieChartLabelParts,
} from "@/components/charts/pie-chart-card"

describe("pie chart data labels", () => {
  const cases: Array<[string, PieChartLabelDisplay, PieChartLabelParts]> = [
    [
      "category and percentage",
      { showCategoryLabels: true, showPercentages: true },
      { share: "42%", nameLines: ["India"] },
    ],
    [
      "category only",
      { showCategoryLabels: true, showPercentages: false },
      { share: null, nameLines: ["India"] },
    ],
    [
      "percentage only",
      { showCategoryLabels: false, showPercentages: true },
      { share: "42%", nameLines: null },
    ],
    [
      "neither",
      { showCategoryLabels: false, showPercentages: false },
      { share: null, nameLines: null },
    ],
  ]

  it.each(cases)("formats %s", (_name, display, expected) => {
    expect(getPieChartLabelParts("India", 42, display)).toEqual(expected)
  })

  it("keeps short names on one line", () => {
    expect(wrapPieChartLabelName("Customer Support")).toEqual(["Customer Support"])
  })

  it("breaks long names onto a second line at a space", () => {
    expect(wrapPieChartLabelName("Healthcare Life Sciences & Pharma")).toEqual([
      "Healthcare Life",
      "Sciences & Pharma",
    ])
  })

  it("shortens a name that does not fit in two lines", () => {
    expect(wrapPieChartLabelName("Banking Financial Services and Insurance")).toEqual([
      "Banking Financial",
      "Services and Insu…",
    ])
  })

  it("shortens a single word longer than a line", () => {
    expect(wrapPieChartLabelName("Pharmaceuticalsandbiotech")).toEqual(["Pharmaceuticalsan…"])
  })
})
