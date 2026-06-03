import { describe, expect, it } from "vitest"
import {
  calculateCenterChartData,
  calculateChartData,
  calculateCityChartData,
  calculateFunctionChartData,
} from "@/lib/utils/chart-helpers"
import { getAccountChartData, getCenterChartData, getProspectChartData } from "@/lib/dashboard/charts"
import { makeAccount, makeCenter, makeFunction, makeProspect } from "../fixtures/domain"

describe("chart helpers", () => {
  it("counts values, sorts by count, and uses Unknown for empty values", () => {
    const data = calculateChartData(
      [makeAccount({ account_hq_country: "India" }), makeAccount({ account_hq_country: null }), makeAccount({ account_hq_country: "India" })],
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

  it("groups city chart overflow into Others", () => {
    const centers = ["A", "B", "C", "D", "E", "F", "G"].map((city) => makeCenter({ center_city: city }))
    expect(calculateCityChartData(centers).at(-1)).toEqual({ name: "Others", value: 2 })
  })

  it("counts functions only for selected center keys", () => {
    const result = calculateFunctionChartData(
      [makeFunction({ cn_unique_key: "CN-1", function_name: "Engineering" }), makeFunction({ cn_unique_key: "CN-2", function_name: "Finance" })],
      ["CN-1"]
    )
    expect(result).toEqual([{ name: "Engineering", value: 1 }])
  })

  it("dashboard chart adapters expose the expected chart groups", () => {
    expect(getAccountChartData([makeAccount()]).regionData).toEqual([{ name: "India", value: 1 }])
    expect(getCenterChartData([makeCenter()], [makeFunction()]).functionData).toEqual([{ name: "Engineering", value: 1 }])
    expect(getProspectChartData([makeProspect()]).departmentData).toEqual([{ name: "Engineering", value: 1 }])
    expect(calculateCenterChartData([makeCenter()], "center_type")).toEqual([{ name: "Captive", value: 1 }])
  })

  it("handles missing function and center fields gracefully", () => {
    expect(calculateCenterChartData([makeCenter({ center_type: null })], "center_type")).toEqual([{ name: "Unknown", value: 1 }])
    expect(calculateFunctionChartData([makeFunction({ cn_unique_key: "CN-1", function_name: null })], ["CN-1"])).toEqual([{ name: "Unknown", value: 1 }])
  })
})
