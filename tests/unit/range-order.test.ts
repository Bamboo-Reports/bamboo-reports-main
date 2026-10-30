import { describe, expect, it } from "vitest"
import { compareRangeLabels, rangeLowerBound } from "@/lib/utils/range-order"

describe("range order", () => {
  it("reads the lower bound with its unit", () => {
    expect(rangeLowerBound("51 - 100")).toBe(51)
    expect(rangeLowerBound("1K - 5K")).toBe(1000)
    expect(rangeLowerBound("10Mn - 50Mn")).toBe(10_000_000)
    expect(rangeLowerBound(">50Bn")).toBe(50_000_000_000)
  })

  it("puts '<X' first and labels without a number last", () => {
    expect(rangeLowerBound("<50")).toBe(-1)
    expect(rangeLowerBound("Unknown")).toBe(Number.POSITIVE_INFINITY)
  })

  it("orders headcount and revenue buckets by range", () => {
    expect(["1K - 5K", "<50", "201 - 500", "51 - 100", "101 - 200", "501 - 1K"].sort(compareRangeLabels)).toEqual([
      "<50",
      "51 - 100",
      "101 - 200",
      "201 - 500",
      "501 - 1K",
      "1K - 5K",
    ])
    expect(["1Bn - 5Bn", "10Mn - 50Mn", ">50Bn", "501Mn - 1Bn", "<10Mn"].sort(compareRangeLabels)).toEqual([
      "<10Mn",
      "10Mn - 50Mn",
      "501Mn - 1Bn",
      "1Bn - 5Bn",
      ">50Bn",
    ])
  })
})
