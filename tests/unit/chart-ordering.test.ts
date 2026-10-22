import { describe, expect, it } from "vitest"
import { orderChartSegments, rangeLowerBound } from "@/lib/utils/chart-helpers"

const seg = (name: string, value: number) => ({ name, value })

describe("rangeLowerBound (#350)", () => {
  it("reads bucket labels with units", () => {
    expect(rangeLowerBound("<50")).toBe(-1)
    expect(rangeLowerBound("51 - 100")).toBe(51)
    expect(rangeLowerBound("1K - 5K")).toBe(1000)
    expect(rangeLowerBound("501Mn - 1Bn")).toBe(501e6)
    expect(rangeLowerBound(">50Bn")).toBe(50e9)
    expect(rangeLowerBound("Bengaluru")).toBeNull()
  })
})

describe("orderChartSegments (#350)", () => {
  it("orders range buckets by range and keeps Others last", () => {
    const ordered = orderChartSegments([
      seg("1Bn - 5Bn", 545),
      seg("10Bn - 25Bn", 274),
      seg("501Mn - 1Bn", 256),
      seg(">50Bn", 158),
      seg("Others", 206),
      seg("10Mn - 50Mn", 210),
    ])
    expect(ordered.map((s) => s.name)).toEqual([
      "10Mn - 50Mn",
      "501Mn - 1Bn",
      "1Bn - 5Bn",
      "10Bn - 25Bn",
      ">50Bn",
      "Others",
    ])
  })

  it("orders categories largest first and moves a data category named Others last", () => {
    const ordered = orderChartSegments([seg("IT", 3370), seg("Others", 2467), seg("AI", 1660), seg("HR", 1586)])
    expect(ordered.map((s) => s.name)).toEqual(["IT", "AI", "HR", "Others"])
  })

  it("puts <50 first among headcount buckets", () => {
    const ordered = orderChartSegments([seg("201 - 500", 1418), seg("<50", 1064), seg("1K - 5K", 972), seg("51 - 100", 718)])
    expect(ordered.map((s) => s.name)).toEqual(["<50", "51 - 100", "201 - 500", "1K - 5K"])
  })
})
