import type { Filters } from "@/lib/types"

type FilterGroup = "account" | "center" | "prospect"
type FilterInputType = "segmented_control" | "multi_select" | "keyword" | "range" | "toggle"

type FilterMetadata = {
  label: string
  group: FilterGroup
  inputType: FilterInputType
}

export const FILTER_METADATA = {
  accountVisibilityMode: {
    label: "Account Visibility",
    group: "account",
    inputType: "segmented_control",
  },
  accountHqRegionValues: {
    label: "HQ Region",
    group: "account",
    inputType: "multi_select",
  },
  accountHqCountryValues: {
    label: "HQ Country",
    group: "account",
    inputType: "multi_select",
  },
  accountHqIndustryValues: {
    label: "Sub Industry",
    group: "account",
    inputType: "multi_select",
  },
  accountDataCoverageValues: {
    label: "Coverage",
    group: "account",
    inputType: "multi_select",
  },
  accountSourceValues: {
    label: "Source",
    group: "account",
    inputType: "multi_select",
  },
  accountTypeValues: {
    label: "Type",
    group: "account",
    inputType: "multi_select",
  },
  accountPrimaryCategoryValues: {
    label: "Industry",
    group: "account",
    inputType: "multi_select",
  },
  accountPrimaryNatureValues: {
    label: "Segment",
    group: "account",
    inputType: "multi_select",
  },
  accountNasscomStatusValues: {
    label: "NASSCOM GCC Listing Status",
    group: "account",
    inputType: "multi_select",
  },
  accountHqEmployeeRangeValues: {
    label: "HQ Employee Range",
    group: "account",
    inputType: "multi_select",
  },
  accountCenterEmployeesRangeValues: {
    label: "GCC Aggregate Headcount (India)",
    group: "account",
    inputType: "multi_select",
  },
  accountHqRevenueRange: {
    label: "HQ Company Revenue",
    group: "account",
    inputType: "range",
  },
  accountHqRevenueIncludeNull: {
    label: "HQ Company Revenue Include All",
    group: "account",
    inputType: "toggle",
  },
  accountYearsInIndiaRange: {
    label: "Years In India",
    group: "account",
    inputType: "range",
  },
  yearsInIndiaIncludeNull: {
    label: "Years In India Include All",
    group: "account",
    inputType: "toggle",
  },
  accountGlobalLegalNameKeywords: {
    label: "Account Name",
    group: "account",
    inputType: "keyword",
  },
  centerTypeValues: {
    label: "Center Type",
    group: "center",
    inputType: "multi_select",
  },
  centerFocusValues: {
    label: "Center Focus",
    group: "center",
    inputType: "multi_select",
  },
  centerCityValues: {
    label: "City",
    group: "center",
    inputType: "multi_select",
  },
  centerStateValues: {
    label: "State",
    group: "center",
    inputType: "multi_select",
  },
  centerCountryValues: {
    label: "Country",
    group: "center",
    inputType: "multi_select",
  },
  centerEmployeesRangeValues: {
    label: "Center Headcount",
    group: "center",
    inputType: "multi_select",
  },
  centerStatusValues: {
    label: "Status",
    group: "center",
    inputType: "multi_select",
  },
  centerIncYearRange: {
    label: "Incorporation Timeline",
    group: "center",
    inputType: "range",
  },
  centerIncYearIncludeNull: {
    label: "Incorporation Timeline Include All",
    group: "center",
    inputType: "toggle",
  },
  functionNameValues: {
    label: "Services Offered",
    group: "center",
    inputType: "multi_select",
  },
  techSoftwareInUseKeywords: {
    label: "Software In Use",
    group: "center",
    inputType: "keyword",
  },
  prospectDepartmentValues: {
    label: "Department",
    group: "prospect",
    inputType: "multi_select",
  },
  prospectHeadTypeValues: {
    label: "Role",
    group: "prospect",
    inputType: "multi_select",
  },
  prospectLevelValues: {
    label: "Seniority Level",
    group: "prospect",
    inputType: "multi_select",
  },
  prospectCityValues: {
    label: "City",
    group: "prospect",
    inputType: "multi_select",
  },
  prospectTitleKeywords: {
    label: "Job Title",
    group: "prospect",
    inputType: "keyword",
  },
} satisfies Record<keyof Filters, FilterMetadata>

export const getFilterMetadata = (filterKey: keyof Filters) => FILTER_METADATA[filterKey]

export const getFilterMetadataProperties = (filterKey: keyof Filters) => {
  const metadata = getFilterMetadata(filterKey)

  return {
    filter_name: metadata.label,
    filter_group: metadata.group,
    filter_input_type: metadata.inputType,
  }
}
