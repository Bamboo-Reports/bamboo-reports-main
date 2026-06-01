import { describe, expect, it } from "vitest"
import {
  formatRevenueInMillions,
  getPageInfo,
  getPaginatedData,
  getTotalPages,
  parseRevenue,
} from "@/lib/utils/helpers"

describe("parseRevenue", () => {
  it("returns 0 for null or undefined", () => {
    expect(parseRevenue(null)).toBe(0)
    expect(parseRevenue(undefined)).toBe(0)
  })

  it("passes a numeric value through", () => {
    expect(parseRevenue(1500)).toBe(1500)
  })

  it("parses a numeric string", () => {
    expect(parseRevenue("2500")).toBe(2500)
  })

  it("parses a leading number from a messy string", () => {
    expect(parseRevenue("1200 million")).toBe(1200)
  })

  it("returns 0 for an unparseable string", () => {
    expect(parseRevenue("N/A")).toBe(0)
  })
})

describe("formatRevenueInMillions", () => {
  it("appends an M suffix", () => {
    expect(formatRevenueInMillions(5)).toBe("5M")
  })

  it("uses locale grouping for large values", () => {
    expect(formatRevenueInMillions(1000)).toBe(`${(1000).toLocaleString()}M`)
  })
})

describe("getPaginatedData", () => {
  const data = [1, 2, 3, 4, 5]

  it("returns the first page slice", () => {
    expect(getPaginatedData(data, 1, 2)).toEqual([1, 2])
  })

  it("returns a middle page slice", () => {
    expect(getPaginatedData(data, 2, 2)).toEqual([3, 4])
  })

  it("returns a partial final page", () => {
    expect(getPaginatedData(data, 3, 2)).toEqual([5])
  })

  it("returns an empty array past the end", () => {
    expect(getPaginatedData(data, 10, 2)).toEqual([])
  })
})

describe("getTotalPages", () => {
  it("rounds up partial pages", () => {
    expect(getTotalPages(5, 2)).toBe(3)
  })

  it("returns an exact count when evenly divisible", () => {
    expect(getTotalPages(4, 2)).toBe(2)
  })

  it("returns 1 when items per page is zero or negative", () => {
    expect(getTotalPages(10, 0)).toBe(1)
    expect(getTotalPages(10, -5)).toBe(1)
  })

  it("returns 0 pages for no items", () => {
    expect(getTotalPages(0, 10)).toBe(0)
  })
})

describe("getPageInfo", () => {
  it("reports the range for a full page", () => {
    expect(getPageInfo(1, 25, 10)).toEqual({ startItem: 1, endItem: 10, totalItems: 25 })
  })

  it("clamps the end item to the total on the last page", () => {
    expect(getPageInfo(3, 25, 10)).toEqual({ startItem: 21, endItem: 25, totalItems: 25 })
  })
})
