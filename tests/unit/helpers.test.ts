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

  it("handles string with leading whitespace", () => {
    expect(parseRevenue("  500")).toBe(500)
  })

  it("handles decimal revenue values", () => {
    expect(parseRevenue(99.99)).toBeCloseTo(99.99)
    expect(parseRevenue("99.99")).toBeCloseTo(99.99)
  })

  it("handles negative revenue values", () => {
    expect(parseRevenue(-100)).toBe(-100)
    expect(parseRevenue("-200")).toBe(-200)
  })

  it("handles zero revenue", () => {
    expect(parseRevenue(0)).toBe(0)
    expect(parseRevenue("0")).toBe(0)
  })
})

describe("formatRevenueInMillions", () => {
  it("appends an M suffix", () => {
    expect(formatRevenueInMillions(5)).toBe("5M")
  })

  it("uses locale grouping for large values", () => {
    expect(formatRevenueInMillions(1000)).toBe(`${(1000).toLocaleString()}M`)
  })

  it("handles zero", () => {
    expect(formatRevenueInMillions(0)).toBe("0M")
  })

  it("handles negative values", () => {
    expect(formatRevenueInMillions(-500)).toBe(`${(-500).toLocaleString()}M`)
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

  it("handles page 0 by returning empty array (page number treated as negative offset)", () => {
    expect(getPaginatedData(data, 0, 2)).toEqual([])
  })

  it("handles empty data array", () => {
    expect(getPaginatedData([], 1, 10)).toEqual([])
  })

  it("handles single item per page", () => {
    expect(getPaginatedData(data, 2, 1)).toEqual([2])
  })

  it("handles itemsPerPage larger than data", () => {
    expect(getPaginatedData(data, 1, 100)).toEqual(data)
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

  it("handles single item", () => {
    expect(getTotalPages(1, 10)).toBe(1)
  })

  it("handles items per page of 1", () => {
    expect(getTotalPages(5, 1)).toBe(5)
  })
})

describe("getPageInfo", () => {
  it("reports the range for a full page", () => {
    expect(getPageInfo(1, 25, 10)).toEqual({ startItem: 1, endItem: 10, totalItems: 25 })
  })

  it("clamps the end item to the total on the last page", () => {
    expect(getPageInfo(3, 25, 10)).toEqual({ startItem: 21, endItem: 25, totalItems: 25 })
  })

  it("handles single item total", () => {
    expect(getPageInfo(1, 1, 10)).toEqual({ startItem: 1, endItem: 1, totalItems: 1 })
  })

  it("handles exactly one full page", () => {
    expect(getPageInfo(1, 10, 10)).toEqual({ startItem: 1, endItem: 10, totalItems: 10 })
  })

  it("handles empty dataset", () => {
    expect(getPageInfo(1, 0, 10)).toEqual({ startItem: 1, endItem: 0, totalItems: 0 })
  })
})
