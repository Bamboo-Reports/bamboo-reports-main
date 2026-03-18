import type { UserRole } from "@/lib/auth/roles"

export interface Account {
  uuid?: string | null
  account_last_update_date?: string | null
  account_nasscom_status: string | null
  account_nasscom_member_status?: string | null
  account_data_coverage?: string | null
  account_source?: string | null
  account_type?: string | null
  account_global_legal_name: string
  account_hq_stock_ticker?: string | null
  account_hq_company_type?: string | null
  account_about?: string | null
  account_hq_key_offerings?: string | null
  account_key_offerings_source_link?: string | null
  account_hq_address?: string | null
  account_hq_city?: string | null
  account_hq_state?: string | null
  account_hq_zip_code?: string | null
  account_hq_country: string | null
  account_hq_region: string | null
  account_hq_boardline?: string | null
  account_hq_sub_industry?: string | null
  account_hq_industry?: string | null
  account_hq_linkedin_link?: string | null
  account_primary_category?: string | null
  account_primary_nature?: string | null
  account_hq_revenue?: number | null
  account_hq_revenue_range?: string | null
  account_hq_fy_end?: string | null
  account_hq_revenue_year?: number | null
  account_hq_revenue_source_type?: string | null
  account_hq_revenue_source_link?: string | null
  account_hq_employee_count?: number | null
  account_hq_employee_range?: string | null
  account_hq_employee_source_type?: string | null
  account_hq_employee_source_link?: string | null
  account_hq_forbes_2000_rank?: number | null
  account_hq_fortune_500_rank?: number | null
  account_first_center_year?: number | null
  years_in_india?: number | null
  account_hq_website?: string | null
  account_center_employees?: number | null
  account_center_employees_range?: string | null
  account_comments?: string | null
  account_coverage?: string | null
}

export interface Center {
  uuid?: string | null
  last_update_date?: string | null
  account_global_legal_name: string
  cn_unique_key: string
  center_status: string | null
  center_inc_year?: number | null
  announced_year?: number | null
  announced_month?: string | null
  center_inc_year_notes?: string | null
  center_inc_year_updated_link?: string | null
  center_timeline?: string | null
  center_end_year?: number | null
  center_name: string | null
  center_management_partner?: string | null
  center_jv_status?: string | null
  center_jv_name?: string | null
  center_type: string | null
  center_focus: string | null
  center_source_link?: string | null
  center_website?: string | null
  center_linkedin?: string | null
  center_address?: string | null
  center_city: string | null
  center_state: string | null
  center_zip_code?: string | null
  center_country: string | null
  center_country_iso2?: string | null
  center_region?: string | null
  center_employees?: number | null
  center_employees_range?: string | null
  center_employees_range_source_link?: string | null
  center_services?: string | null
  center_first_year?: number | null
  center_comments?: string | null
  center_business_segment?: string | null
  center_business_sub_segment?: string | null
  center_boardline?: string | null
  center_account_website?: string | null
  lat?: number | null
  lng?: number | null
}

export interface Function {
  uuid?: string | null
  cn_unique_key: string
  function_name: string
}

export interface Service {
  uuid?: string | null
  last_update_date?: string | null
  cn_unique_key: string
  center_name: string | null
  center_type: string | null
  center_focus: string | null
  center_city: string | null
  primary_service: string | null
  focus_region: string | null
  service_it: string | null
  service_erd: string | null
  service_fna: string | null
  service_hr: string | null
  service_procurement: string | null
  service_sales_marketing: string | null
  service_customer_support: string | null
  service_others: string | null
  software_vendor: string | null
  software_in_use: string | null
  account_global_legal_name?: string | null
}

export interface Tech {
  uuid?: string | null
  account_global_legal_name: string | null
  cn_unique_key: string | null
  software_in_use: string | null
  software_vendor: string | null
  software_category: string | null
}

export interface Prospect {
  uuid?: string | null
  last_update_date?: string | null
  account_global_legal_name: string
  center_name: string | null
  prospect_full_name?: string | null
  prospect_first_name: string | null
  prospect_last_name: string | null
  prospect_title: string | null
  prospect_department: string | null
  prospect_level: string | null
  prospect_linkedin_url: string | null
  prospect_email: string | null
  prospect_city: string | null
  prospect_state: string | null
  prospect_country: string | null
}

export interface Profile {
  id: string
  user_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role?: UserRole | null
}

export interface FilterValue {
  value: string
  mode: 'include' | 'exclude'
}

export interface Filters {
  accountHqRegionValues: FilterValue[]
  accountHqCountryValues: FilterValue[]
  accountHqIndustryValues: FilterValue[]
  accountDataCoverageValues: FilterValue[]
  accountSourceValues: FilterValue[]
  accountTypeValues: FilterValue[]
  accountPrimaryCategoryValues: FilterValue[]
  accountPrimaryNatureValues: FilterValue[]
  accountNasscomStatusValues: FilterValue[]
  accountHqEmployeeRangeValues: FilterValue[]
  accountCenterEmployeesRangeValues: FilterValue[]
  accountHqRevenueRange: [number, number]
  accountHqRevenueIncludeNull: boolean
  accountYearsInIndiaRange: [number, number]
  yearsInIndiaIncludeNull: boolean
  accountGlobalLegalNameKeywords: FilterValue[]
  centerTypeValues: FilterValue[]
  centerFocusValues: FilterValue[]
  centerCityValues: FilterValue[]
  centerStateValues: FilterValue[]
  centerCountryValues: FilterValue[]
  centerEmployeesRangeValues: FilterValue[]
  centerStatusValues: FilterValue[]
  centerIncYearRange: [number, number]
  centerIncYearIncludeNull: boolean
  functionNameValues: FilterValue[]
  techSoftwareInUseKeywords: FilterValue[]
  prospectDepartmentValues: FilterValue[]
  prospectLevelValues: FilterValue[]
  prospectCityValues: FilterValue[]
  prospectTitleKeywords: FilterValue[]
}

export interface FilterOption {
  value: string
  count: number
  disabled?: boolean
}

export interface AvailableOptions {
  accountHqRegionValues: FilterOption[]
  accountHqCountryValues: FilterOption[]
  accountHqIndustryValues: FilterOption[]
  accountDataCoverageValues: FilterOption[]
  accountSourceValues: FilterOption[]
  accountTypeValues: FilterOption[]
  accountPrimaryCategoryValues: FilterOption[]
  accountPrimaryNatureValues: FilterOption[]
  accountNasscomStatusValues: FilterOption[]
  accountHqEmployeeRangeValues: FilterOption[]
  accountCenterEmployeesRangeValues: FilterOption[]
  centerTypeValues: FilterOption[]
  centerFocusValues: FilterOption[]
  centerCityValues: FilterOption[]
  centerStateValues: FilterOption[]
  centerCountryValues: FilterOption[]
  centerEmployeesRangeValues: FilterOption[]
  centerStatusValues: FilterOption[]
  functionNameValues: FilterOption[]
  prospectDepartmentValues: FilterOption[]
  prospectLevelValues: FilterOption[]
  prospectCityValues: FilterOption[]
}

export interface ChartData {
  name: string
  value: number
}

export interface AccountFinancialInfo {
  inputTicker: string
  normalizedTicker: string
  symbol: string
  exchange: string | null
  currency: string | null
  shortName: string | null
  longName: string | null
  regularMarketPrice: number | null
  regularMarketChange: number | null
  regularMarketChangePercent: number | null
  regularMarketOpen: number | null
  regularMarketDayHigh: number | null
  regularMarketDayLow: number | null
  regularMarketPreviousClose: number | null
  regularMarketVolume: number | null
  averageVolume: number | null
  marketCap: number | null
  fiftyTwoWeekLow: number | null
  fiftyTwoWeekHigh: number | null
  trailingPE: number | null
  forwardPE: number | null
  epsTrailingTwelveMonths: number | null
  dividendYield: number | null
  payoutRatio: number | null
  beta: number | null
  exDividendDate: string | null
  sector: string | null
  industry: string | null
  fullTimeEmployees: number | null
  country: string | null
  website: string | null
  recommendationKey: string | null
  numberOfAnalystOpinions: number | null
  targetHighPrice: number | null
  targetLowPrice: number | null
  targetMeanPrice: number | null
  totalRevenue: number | null
  netProfit: number | null
  ebitda: number | null
  grossMargins: number | null
  operatingMargins: number | null
  profitMargins: number | null
  freeCashflow: number | null
  operatingCashflow: number | null
  debtToEquity: number | null
  returnOnAssets: number | null
  returnOnEquity: number | null
  enterpriseValue: number | null
  sharesOutstanding: number | null
  heldPercentInstitutions: number | null
  heldPercentInsiders: number | null
  annualRevenueSeries: RevenueSeriesPoint[]
  quarterlyRevenueSeries: RevenueSeriesPoint[]
}

export interface AccountFinancialInfoResponse {
  success: boolean
  error: string | null
  data: AccountFinancialInfo | null
}

export interface RevenueSeriesPoint {
  date: string
  label: string
  revenue: number
}
