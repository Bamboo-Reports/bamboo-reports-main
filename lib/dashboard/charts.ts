import type { Account, Center, Function, Prospect } from "@/lib/types"
import {
  calculateChartData,
  calculateCenterChartData,
  calculateCityChartData,
  calculateFunctionChartData,
} from "@/lib/utils/chart-helpers"

export function getAccountChartData(accounts: Account[]) {
  return {
    regionData: calculateChartData(accounts, "account_hq_region"),
    primaryNatureData: calculateChartData(accounts, "account_primary_nature"),
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
