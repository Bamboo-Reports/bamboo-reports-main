import { describe, expect, it } from "vitest"
import { compareRangeLabels, rangeLowerBound } from "@/lib/utils/helpers"

describe("rangeLowerBound", () => {
  it("scales the first number by its unit", () => {
    expect(rangeLowerBound("10Bn - 25Bn")).toBe(10e9)
    expect(rangeLowerBound("501 - 1K")).toBe(501)
    expect(rangeLowerBound("5K - 10K")).toBe(5e3)
    expect(rangeLowerBound(">50Bn")).toBe(50e9)
  })

  it("puts open-ended lower buckets first and unknowns at null", () => {
    expect(rangeLowerBound("<10Mn")).toBe(-1)
    expect(rangeLowerBound(null)).toBeNull()
    expect(rangeLowerBound("Unknown")).toBeNull()
  })
})

describe("compareRangeLabels", () => {
  const labels = [">50Bn", "<10Mn", null, "101Mn - 250Mn", "10Bn - 25Bn"]

  it("orders by magnitude ascending with missing last", () => {
    expect([...labels].sort((a, b) => compareRangeLabels(a, b))).toEqual([
      "<10Mn",
      "101Mn - 250Mn",
      "10Bn - 25Bn",
      ">50Bn",
      null,
    ])
  })

  it("keeps missing last when descending", () => {
    expect([...labels].sort((a, b) => compareRangeLabels(a, b, "desc"))).toEqual([
      ">50Bn",
      "10Bn - 25Bn",
      "101Mn - 250Mn",
      "<10Mn",
      null,
    ])
  })
})
