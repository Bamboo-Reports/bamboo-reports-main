import type { Account, Center, Function, Prospect } from "@/lib/types"
import {
  calculateChartData,
  calculateCenterChartData,
  calculateCityChartData,
  calculateFunctionChartData,
} from "@/lib/utils/chart-helpers"

export function getAccountChartData(accounts: Account[]) {
  return {
    regionData: calculateChartData(accounts, "account_hq_country"),
    primaryNatureData: calculateChartData(accounts, "account_primary_category"),
    revenueRangeData: calculateChartData(accounts, "account_hq_revenue_range"),
    employeesRangeData: calculateChartData(accounts, "account_center_employees_range"),
  }
}

export function getCenterChartData(centers: Center[], functions: Function[]) {
  const centerKeys = centers.map((center) => center.cn_unique_key)

  return {
    centerTypeData: calculateCenterChartData(centers, "center_type"),
    employeesRangeData: calculateCenterChartData(centers, "center_employees_range"),
    cityData: calculateCityChartData(centers),
    functionData: calculateFunctionChartData(functions, centerKeys),
  }
}

export function getProspectChartData(prospects: Prospect[]) {
  return {
    departmentData: calculateChartData(prospects, "prospect_department"),
    levelData: calculateChartData(prospects, "prospect_level"),
    cityData: calculateChartData(prospects, "prospect_city"),
  }
}

/**
 * Uncapped chart data for the summary PDF. The dashboard trims each chart to
 * its top ten (top five plus Others for cities); the report groups small
 * slices itself and lists what went into Others, so it needs every category.
 */
export function getReportChartData(input: {
  accounts: Account[]
  centers: Center[]
  functions: Function[]
  prospects: Prospect[]
}) {
  const centerKeys = input.centers.map((center) => center.cn_unique_key)
  const all = Number.POSITIVE_INFINITY

  return {
    accounts: {
      regionData: calculateChartData(input.accounts, "account_hq_country", all),
      primaryNatureData: calculateChartData(input.accounts, "account_primary_category", all),
      revenueRangeData: calculateChartData(input.accounts, "account_hq_revenue_range", all),
      employeesRangeData: calculateChartData(input.accounts, "account_center_employees_range", all),
    },
    centers: {
      centerTypeData: calculateCenterChartData(input.centers, "center_type", all),
      employeesRangeData: calculateCenterChartData(input.centers, "center_employees_range", all),
      cityData: calculateCenterChartData(input.centers, "center_city", all),
      functionData: calculateFunctionChartData(input.functions, centerKeys, all),
    },
    prospects: {
      departmentData: calculateChartData(input.prospects, "prospect_department", all),
      levelData: calculateChartData(input.prospects, "prospect_level", all),
    },
  }
}
