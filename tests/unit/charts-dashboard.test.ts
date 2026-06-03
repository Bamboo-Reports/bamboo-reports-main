import { describe, expect, it } from "vitest"
import { getAccountChartData, getCenterChartData, getProspectChartData } from "@/lib/dashboard/charts"
import { makeAccount, makeCenter, makeFunction, makeProspect } from "../fixtures/domain"

describe("getAccountChartData", () => {
  it("returns all four chart groups", () => {
    const data = getAccountChartData([makeAccount()])
    expect(data).toHaveProperty("regionData")
    expect(data).toHaveProperty("primaryNatureData")
    expect(data).toHaveProperty("revenueRangeData")
    expect(data).toHaveProperty("employeesRangeData")
  })

  it("handles empty accounts array", () => {
    const data = getAccountChartData([])
    expect(data.regionData).toEqual([])
    expect(data.primaryNatureData).toEqual([])
    expect(data.revenueRangeData).toEqual([])
    expect(data.employeesRangeData).toEqual([])
  })

  it("aggregates multiple accounts correctly", () => {
    const data = getAccountChartData([
      makeAccount({ account_hq_country: "India" }),
      makeAccount({ account_hq_country: "India" }),
      makeAccount({ account_hq_country: "USA" }),
    ])
    expect(data.regionData).toContainEqual({ name: "India", value: 2 })
    expect(data.regionData).toContainEqual({ name: "USA", value: 1 })
  })
})

describe("getCenterChartData", () => {
  it("returns all four chart groups", () => {
    const center = makeCenter()
    const data = getCenterChartData([center], [makeFunction()])
    expect(data).toHaveProperty("centerTypeData")
    expect(data).toHaveProperty("employeesRangeData")
    expect(data).toHaveProperty("cityData")
    expect(data).toHaveProperty("functionData")
  })

  it("handles empty centers array", () => {
    const data = getCenterChartData([], [])
    expect(data.centerTypeData).toEqual([])
    expect(data.employeesRangeData).toEqual([])
    expect(data.cityData).toEqual([])
    expect(data.functionData).toEqual([])
  })

  it("filters functions to only matching center keys", () => {
    const center = makeCenter({ cn_unique_key: "CN-1" })
    const functions = [
      makeFunction({ cn_unique_key: "CN-1", function_name: "Engineering" }),
      makeFunction({ cn_unique_key: "CN-2", function_name: "Finance" }),
    ]
    const data = getCenterChartData([center], functions)
    expect(data.functionData).toEqual([{ name: "Engineering", value: 1 }])
  })
})

describe("getProspectChartData", () => {
  it("returns all three chart groups", () => {
    const data = getProspectChartData([makeProspect()])
    expect(data).toHaveProperty("departmentData")
    expect(data).toHaveProperty("levelData")
    expect(data).toHaveProperty("cityData")
  })

  it("handles empty prospects array", () => {
    const data = getProspectChartData([])
    expect(data.departmentData).toEqual([])
    expect(data.levelData).toEqual([])
    expect(data.cityData).toEqual([])
  })

  it("aggregates prospect data correctly", () => {
    const data = getProspectChartData([
      makeProspect({ prospect_department: "Engineering", prospect_level: "VP" }),
      makeProspect({ prospect_department: "Engineering", prospect_level: "Director" }),
    ])
    expect(data.departmentData).toEqual([{ name: "Engineering", value: 2 }])
    expect(data.levelData).toHaveLength(2)
  })
})
