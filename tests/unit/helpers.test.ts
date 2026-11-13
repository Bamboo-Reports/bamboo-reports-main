import { describe, expect, it, vi } from "vitest"
import {
  formatAccountLocation,
  formatLocation,
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

describe("formatLocation", () => {
  it("shows only the city when the city is known", () => {
    expect(formatLocation("Pune", "Maharashtra", "India")).toBe("Pune")
    expect(formatLocation(" Pune ", "TBA", "India")).toBe("Pune")
  })

  it("falls back to the state when the city is blank or TBA", () => {
    expect(formatLocation("TBA", "Karnataka", "India")).toBe("Karnataka")
    expect(formatLocation("  ", "Karnataka", "India")).toBe("Karnataka")
    expect(formatLocation(null, "Karnataka")).toBe("Karnataka")
  })

  it("falls back to the country, then India", () => {
    expect(formatLocation("tba", "", "United States")).toBe("United States")
    expect(formatLocation(null, null, "TBA")).toBe("India")
    expect(formatLocation(undefined, undefined)).toBe("India")
  })
})

describe("formatAccountLocation", () => {
  it("uses the HQ city, else state, else country, and stays blank with none", () => {
    expect(formatAccountLocation({ account_hq_city: "Campbell", account_hq_state: "California", account_hq_country: "United States" })).toBe("Campbell")
    expect(formatAccountLocation({ account_hq_city: "TBA", account_hq_state: "California", account_hq_country: "United States" })).toBe("California")
    expect(formatAccountLocation({ account_hq_city: null, account_hq_state: "", account_hq_country: "Japan" })).toBe("Japan")
    expect(formatAccountLocation({ account_hq_city: null, account_hq_country: null })).toBe("")
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

describe("copyToClipboard", () => {
  it("writes text to navigator.clipboard", async () => {
    const writeTextMock = vi.fn()
    
    // Setup mock
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    })
    
    // Import copyToClipboard inline since it wasn't imported at top
    const { copyToClipboard } = await import("@/lib/utils/helpers")
    copyToClipboard("test-text")
    expect(writeTextMock).toHaveBeenCalledWith("test-text")
    
    // Cleanup mock
    vi.unstubAllGlobals()
  })
})
