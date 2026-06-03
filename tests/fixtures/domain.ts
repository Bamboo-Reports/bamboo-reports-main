import {
  createDefaultFilters,
  DEFAULT_CENTER_INC_YEAR_RANGE,
  DEFAULT_REVENUE_RANGE,
  DEFAULT_YEARS_IN_INDIA_RANGE,
} from "@/lib/dashboard/defaults"
import type {
  Account,
  Alias,
  AvailableOptions,
  Center,
  Filters,
  FilterValue,
  Function,
  Prospect,
  Service,
  Tech,
} from "@/lib/types"

export const fv = (value: string, mode: FilterValue["mode"] = "include"): FilterValue => ({ value, mode })

export const makeFilters = (overrides: Partial<Filters> = {}) =>
  createDefaultFilters({
    accountHqRevenueIncludeNull: true,
    yearsInIndiaIncludeNull: true,
    centerIncYearIncludeNull: true,
    ...overrides,
  })

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    account_global_legal_name: "Acme Corp",
    account_hq_country: "India",
    account_hq_region: "APAC",
    account_hq_industry: "Software",
    account_primary_category: "Technology",
    account_primary_nature: "Enterprise",
    account_nasscom_status: "Listed",
    account_hq_revenue: 1000,
    account_hq_revenue_range: "$1B-$5B",
    account_hq_employee_range: "1001-5000",
    account_center_employees_range: "501-1000",
    years_in_india: 10,
    account_visibility: "include",
    ...overrides,
  } as Account
}

export function makeCenter(overrides: Partial<Center> = {}): Center {
  return {
    account_global_legal_name: "Acme Corp",
    cn_unique_key: "CN-1",
    center_status: "Active",
    center_name: "Acme India",
    center_type: "Captive",
    center_focus: "Engineering",
    center_city: "Bengaluru",
    center_state: "Karnataka",
    center_country: "India",
    center_employees_range: "501-1000",
    center_inc_year: 2015,
    ...overrides,
  } as Center
}

export function makeFunction(overrides: Partial<Function> = {}): Function {
  return {
    cn_unique_key: "CN-1",
    function_name: "Engineering",
    ...overrides,
  }
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    cn_unique_key: "CN-1",
    center_name: "Acme India",
    center_type: "Captive",
    center_focus: "Engineering",
    center_city: "Bengaluru",
    primary_service: "Product Engineering",
    focus_region: "Global",
    service_it: "Yes",
    service_erd: null,
    service_fna: null,
    service_hr: null,
    service_procurement: null,
    service_sales_marketing: null,
    service_customer_support: null,
    service_others: null,
    software_vendor: null,
    software_in_use: null,
    ...overrides,
  }
}

export function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    account_global_legal_name: "Acme Corp",
    center_name: "Acme India",
    prospect_full_name: "Ada Lovelace",
    prospect_first_name: "Ada",
    prospect_last_name: "Lovelace",
    prospect_title: "VP Engineering",
    head_type: "Decision Maker",
    prospect_department: "Engineering",
    prospect_level: "VP",
    prospect_linkedin_url: "https://linkedin.com/in/ada",
    prospect_email: "ada@example.com",
    prospect_city: "Bengaluru",
    prospect_state: "Karnataka",
    prospect_country: "India",
    ps_unique_key: "PS-1",
    ...overrides,
  }
}

export function makeTech(overrides: Partial<Tech> = {}): Tech {
  return {
    account_global_legal_name: "Acme Corp",
    cn_unique_key: "CN-1",
    software_in_use: "Salesforce",
    software_vendor: "Salesforce",
    software_category: "CRM",
    ...overrides,
  }
}

export function makeAlias(overrides: Partial<Alias> = {}): Alias {
  return {
    uuid: "alias-1",
    account_global_legal_name: "Acme Corp",
    short_legal_name: "Acme",
    brand_name: "Acme Cloud",
    abbreviated_name: "ACM",
    flagship_products: "Roadrunner",
    currently_known_as: null,
    notes: null,
    ...overrides,
  }
}

export const makeDefaultRanges = () => ({
  revenueRange: DEFAULT_REVENUE_RANGE,
  yearsInIndiaRange: DEFAULT_YEARS_IN_INDIA_RANGE,
  centerIncYearRange: DEFAULT_CENTER_INC_YEAR_RANGE,
})

export const makeEmptyAvailableOptions = (): AvailableOptions => ({
  accountHqRegionValues: [],
  accountHqCountryValues: [],
  accountHqIndustryValues: [],
  accountDataCoverageValues: [],
  accountSourceValues: [],
  accountTypeValues: [],
  accountPrimaryCategoryValues: [],
  accountPrimaryNatureValues: [],
  accountNasscomStatusValues: [],
  accountHqEmployeeRangeValues: [],
  accountCenterEmployeesRangeValues: [],
  centerTypeValues: [],
  centerFocusValues: [],
  centerCityValues: [],
  centerStateValues: [],
  centerCountryValues: [],
  centerEmployeesRangeValues: [],
  centerStatusValues: [],
  functionNameValues: [],
  prospectDepartmentValues: [],
  prospectHeadTypeValues: [],
  prospectLevelValues: [],
  prospectCityValues: [],
})
