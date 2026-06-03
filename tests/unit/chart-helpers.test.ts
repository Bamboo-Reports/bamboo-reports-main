import { describe, expect, it } from "vitest"
import {
  calculateCenterChartData,
  calculateChartData,
  calculateCityChartData,
  calculateFunctionChartData,
  CHART_COLORS,
  PIE_CHART_COLORS,
} from "@/lib/utils/chart-helpers"
import { makeAccount, makeCenter, makeFunction, makeProspect } from "../fixtures/domain"

describe("CHART_COLORS", () => {
  it("has exactly 15 colors", () => {
    expect(CHART_COLORS).toHaveLength(15)
  })

  it("all colors are valid hex strings", () => {
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("PIE_CHART_COLORS", () => {
  it("has 9 colors", () => {
    expect(PIE_CHART_COLORS).toHaveLength(9)
  })

  it("all colors are valid hex strings", () => {
    for (const color of PIE_CHART_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("calculateChartData", () => {
  it("counts values, sorts by count, and uses Unknown for empty values", () => {
    const data = calculateChartData(
      [
        makeAccount({ account_hq_country: "India" }),
        makeAccount({ account_hq_country: null }),
        makeAccount({ account_hq_country: "India" }),
      ],
      "account_hq_country"
    )
    expect(data).toEqual([
      { name: "India", value: 2 },
      { name: "Unknown", value: 1 },
    ])
  })

  it("keeps only the top ten values", () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeAccount({ account_hq_country: `C${index}` }))
    expect(calculateChartData(rows, "account_hq_country")).toHaveLength(10)
  })

  it("returns empty array for empty input", () => {
    expect(calculateChartData([], "account_hq_country")).toEqual([])
  })

  it("handles empty string values as Unknown", () => {
    const data = calculateChartData(
      [makeAccount({ account_hq_country: "" }), makeAccount({ account_hq_country: "India" })],
      "account_hq_country"
    )
    expect(data).toContainEqual({ name: "India", value: 1 })
    expect(data).toContainEqual({ name: "Unknown", value: 1 })
  })

  it("maintains sorted order (highest count first)", () => {
    const data = calculateChartData(
      [
        makeAccount({ account_hq_country: "India" }),
        makeAccount({ account_hq_country: "USA" }),
        makeAccount({ account_hq_country: "India" }),
        makeAccount({ account_hq_country: "USA" }),
        makeAccount({ account_hq_country: "USA" }),
      ],
      "account_hq_country"
    )
    expect(data[0].value).toBeGreaterThanOrEqual(data[1].value)
  })
})

describe("calculateCenterChartData", () => {
  it("counts center values and uses Unknown for empty", () => {
    const data = calculateCenterChartData(
      [
        makeCenter({ center_type: "Captive" }),
        makeCenter({ center_type: null }),
        makeCenter({ center_type: "Captive" }),
      ],
      "center_type"
    )
    expect(data).toContainEqual({ name: "Captive", value: 2 })
    expect(data).toContainEqual({ name: "Unknown", value: 1 })
  })

  it("returns empty array for empty centers", () => {
    expect(calculateCenterChartData([], "center_type")).toEqual([])
  })

  it("limits to top 10", () => {
    const centers = Array.from({ length: 15 }, (_, i) => makeCenter({ center_type: `Type${i}` }))
    expect(calculateCenterChartData(centers, "center_type")).toHaveLength(10)
  })
})

describe("calculateCityChartData", () => {
  it("groups city chart overflow into Others", () => {
    const centers = ["A", "B", "C", "D", "E", "F", "G"].map((city) => makeCenter({ center_city: city }))
    expect(calculateCityChartData(centers).at(-1)).toEqual({ name: "Others", value: 2 })
  })

  it("returns all cities when 5 or fewer", () => {
    const centers = ["A", "B", "C"].map((city) => makeCenter({ center_city: city }))
    const data = calculateCityChartData(centers)
    expect(data).toHaveLength(3)
    expect(data.find((d) => d.name === "Others")).toBeUndefined()
  })

  it("returns empty for empty centers", () => {
    expect(calculateCityChartData([])).toEqual([])
  })

  it("handles null city names as Unknown", () => {
    const centers = [makeCenter({ center_city: null })]
    const data = calculateCityChartData(centers)
    expect(data).toContainEqual({ name: "Unknown", value: 1 })
  })

  it("renders exactly 6 entries for 7 cities (5 top + 1 Others)", () => {
    const centers = Array.from({ length: 7 }, (_, i) => makeCenter({ center_city: `City${i}` }))
    expect(calculateCityChartData(centers)).toHaveLength(6)
  })

  it("does not add Others group if remaining count is 0", () => {
    const centers = Array.from({ length: 5 }, (_, i) => makeCenter({ center_city: `City${i}` }))
    const data = calculateCityChartData(centers)
    expect(data.find((d) => d.name === "Others")).toBeUndefined()
  })
})

describe("calculateFunctionChartData", () => {
  it("counts functions only for selected center keys", () => {
    const result = calculateFunctionChartData(
      [
        makeFunction({ cn_unique_key: "CN-1", function_name: "Engineering" }),
        makeFunction({ cn_unique_key: "CN-2", function_name: "Finance" }),
      ],
      ["CN-1"]
    )
    expect(result).toEqual([{ name: "Engineering", value: 1 }])
  })

  it("returns empty array for empty input", () => {
    expect(calculateFunctionChartData([], [])).toEqual([])
  })

  it("ignores functions with no matching center keys", () => {
    const result = calculateFunctionChartData(
      [makeFunction({ cn_unique_key: "CN-3", function_name: "Engineering" })],
      ["CN-1", "CN-2"]
    )
    expect(result).toEqual([])
  })

  it("handles null function names as Unknown", () => {
    const result = calculateFunctionChartData(
      [makeFunction({ cn_unique_key: "CN-1", function_name: null as unknown as string })],
      ["CN-1"]
    )
    expect(result).toContainEqual({ name: "Unknown", value: 1 })
  })

  it("limits to top 10", () => {
    const functions = Array.from({ length: 12 }, (_, i) =>
      makeFunction({ cn_unique_key: "CN-1", function_name: `Func${i}` })
    )
    expect(calculateFunctionChartData(functions, ["CN-1"])).toHaveLength(10)
  })
})
