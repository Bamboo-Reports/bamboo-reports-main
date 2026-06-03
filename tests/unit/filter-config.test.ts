import { describe, expect, it } from "vitest"
import {
  FILTER_SECTIONS,
  ENABLED_FILTER_KEYS,
  isFilterEnabled,
  isShowMoreEnabled,
  isPremiumFilter,
  getPremiumFilterKeys,
  isSectionVisible,
  getSectionConfig,
  getEnabledFiltersForSection,
  sanitizeFilters,
} from "@/lib/config/filters"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

describe("FILTER_SECTIONS", () => {
  it("defines three sections", () => {
    expect(FILTER_SECTIONS).toHaveLength(3)
    expect(FILTER_SECTIONS.map((s) => s.id)).toEqual(["accounts", "centers", "prospects"])
  })

  it("has all sections enabled", () => {
    for (const section of FILTER_SECTIONS) {
      expect(section.enabled).toBe(true)
    }
  })

  it("accounts section has premium filter keys", () => {
    const accounts = FILTER_SECTIONS.find((s) => s.id === "accounts")
    expect(accounts?.showMoreEnabled).toBe(true)
    expect(accounts?.premiumFilterKeys).toContain("accountHqRegionValues")
    expect(accounts?.premiumFilterKeys).toContain("accountHqIndustryValues")
  })

  it("centers section has premium filter keys", () => {
    const centers = FILTER_SECTIONS.find((s) => s.id === "centers")
    expect(centers?.showMoreEnabled).toBe(true)
    expect(centers?.premiumFilterKeys).toContain("centerStateValues")
    expect(centers?.premiumFilterKeys).toContain("techSoftwareInUseKeywords")
  })

  it("prospects section has no premium filter keys", () => {
    const prospects = FILTER_SECTIONS.find((s) => s.id === "prospects")
    expect(prospects?.showMoreEnabled).toBeFalsy()
    expect(prospects?.premiumFilterKeys).toBeUndefined()
  })
})

describe("ENABLED_FILTER_KEYS", () => {
  it("contains core enabled filters", () => {
    expect(ENABLED_FILTER_KEYS.has("accountVisibilityMode")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("accountGlobalLegalNameKeywords")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("accountHqRevenueRange")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("accountHqCountryValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("centerTypeValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("centerCityValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("functionNameValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("prospectDepartmentValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("prospectHeadTypeValues")).toBe(true)
    expect(ENABLED_FILTER_KEYS.has("prospectTitleKeywords")).toBe(true)
  })

  it("excludes disabled filters like source, type, coverage", () => {
    expect(ENABLED_FILTER_KEYS.has("accountSourceValues")).toBe(false)
    expect(ENABLED_FILTER_KEYS.has("accountTypeValues")).toBe(false)
    expect(ENABLED_FILTER_KEYS.has("accountDataCoverageValues")).toBe(false)
  })

  it("excludes disabled center country filter", () => {
    expect(ENABLED_FILTER_KEYS.has("centerCountryValues")).toBe(false)
  })
})

describe("isFilterEnabled", () => {
  it("returns true for an enabled filter", () => {
    expect(isFilterEnabled("accountVisibilityMode")).toBe(true)
    expect(isFilterEnabled("centerTypeValues")).toBe(true)
  })

  it("returns false for a disabled filter", () => {
    expect(isFilterEnabled("accountSourceValues")).toBe(false)
    expect(isFilterEnabled("centerCountryValues")).toBe(false)
  })
})

describe("isShowMoreEnabled", () => {
  it("returns true for accounts section", () => {
    expect(isShowMoreEnabled("accounts")).toBe(true)
  })

  it("returns true for centers section", () => {
    expect(isShowMoreEnabled("centers")).toBe(true)
  })

  it("returns false for prospects section", () => {
    expect(isShowMoreEnabled("prospects")).toBe(false)
  })

  it("returns false for unknown section", () => {
    expect(isShowMoreEnabled("unknown")).toBe(false)
  })
})

describe("isPremiumFilter", () => {
  it("identifies premium filters", () => {
    expect(isPremiumFilter("accountHqRegionValues")).toBe(true)
    expect(isPremiumFilter("accountHqIndustryValues")).toBe(true)
    expect(isPremiumFilter("centerStateValues")).toBe(true)
  })

  it("does not flag non-premium filters", () => {
    expect(isPremiumFilter("accountVisibilityMode")).toBe(false)
    expect(isPremiumFilter("centerTypeValues")).toBe(false)
    expect(isPremiumFilter("prospectDepartmentValues")).toBe(false)
  })
})

describe("getPremiumFilterKeys", () => {
  it("returns premium keys for accounts section", () => {
    const keys = getPremiumFilterKeys("accounts")
    expect(keys).toContain("accountHqRegionValues")
    expect(keys).toContain("accountHqEmployeeRangeValues")
  })

  it("returns empty array for known sections without premium keys", () => {
    expect(getPremiumFilterKeys("prospects")).toEqual([])
  })

  it("returns empty array for unknown section", () => {
    expect(getPremiumFilterKeys("nonexistent")).toEqual([])
  })
})

describe("isSectionVisible", () => {
  it("returns true for all known sections", () => {
    expect(isSectionVisible("accounts")).toBe(true)
    expect(isSectionVisible("centers")).toBe(true)
    expect(isSectionVisible("prospects")).toBe(true)
  })

  it("returns false for unknown section", () => {
    expect(isSectionVisible("unknown")).toBe(false)
  })
})

describe("getSectionConfig", () => {
  it("returns the full config for a known section", () => {
    const config = getSectionConfig("accounts")
    expect(config?.id).toBe("accounts")
    expect(config?.label).toBe("Account Attributes")
    expect(config?.filters.length).toBeGreaterThan(0)
  })

  it("returns undefined for unknown section", () => {
    expect(getSectionConfig("unknown")).toBeUndefined()
  })
})

describe("getEnabledFiltersForSection", () => {
  it("returns enabled filter keys for accounts", () => {
    const keys = getEnabledFiltersForSection("accounts")
    expect(keys).toContain("accountVisibilityMode")
    expect(keys).not.toContain("accountSourceValues")
    expect(keys).not.toContain("accountTypeValues")
  })

  it("returns empty array for unknown section", () => {
    expect(getEnabledFiltersForSection("unknown")).toEqual([])
  })
})

describe("sanitizeFilters", () => {
  it("resets disabled filters to defaults", () => {
    const source = createDefaultFilters({
      accountSourceValues: [{ value: "SourceA", mode: "include" }],
      accountTypeValues: [{ value: "TypeA", mode: "include" }],
      accountVisibilityMode: "all",
    })
    const sanitized = sanitizeFilters(source)
    expect(sanitized.accountSourceValues).toEqual([])
    expect(sanitized.accountTypeValues).toEqual([])
    expect(sanitized.accountVisibilityMode).toBe("all")
  })

  it("preserves enabled filter values", () => {
    const source = createDefaultFilters({
      accountVisibilityMode: "all",
      centerTypeValues: [{ value: "Captive", mode: "include" }],
    })
    const sanitized = sanitizeFilters(source)
    expect(sanitized.accountVisibilityMode).toBe("all")
    expect(sanitized.centerTypeValues).toEqual([{ value: "Captive", mode: "include" }])
  })
})
