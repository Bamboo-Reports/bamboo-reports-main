import { describe, expect, it } from "vitest"
import {
  describePieSlice,
  donutRampColor,
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

describe("describePieSlice", () => {
  it("speaks range bounds as words so they survive tag stripping", () => {
    expect(describePieSlice("<50", 382, 2547, "Accounts")).toBe("Under 50: 15%, 382 accounts")
    expect(describePieSlice(">10K", 12, 100, "Centres")).toBe("Over 10K: 12%, 12 centres")
  })

  it("keeps other names as they are", () => {
    expect(describePieSlice("United States", 1523, 2766, "Accounts")).toBe("United States: 55%, 1,523 accounts")
    expect(describePieSlice("Others", 0, 0, "Accounts")).toBe("Others: 0%, 0 accounts")
  })
})

describe("donutRampColor", () => {
  it("runs from the palest to the deepest step and blends in between", () => {
    expect(donutRampColor(0)).toBe("#fef0c3")
    expect(donutRampColor(1)).toBe("#dd6516")
    expect(donutRampColor(0.2)).toBe("#f9d996")
    const eight = Array.from({ length: 8 }, (_, i) => donutRampColor(i / 7))
    expect(new Set(eight).size).toBe(8)
  })
})
