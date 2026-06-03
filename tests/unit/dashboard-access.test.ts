import { describe, expect, it } from "vitest"
import {
  isSectionEnabled,
  isSectionDisabled,
  getEnabledSections,
  getAccessibleDefaultSection,
  isDatasetEnabled,
  getProspectsPerAccountLimit,
  canAccessAccountsMapView,
  getSectionUnavailableMessage,
  getDatasetUnavailableMessage,
  assertSectionEnabled,
  assertDatasetEnabled,
  DASHBOARD_ACCESS_CONFIG,
} from "@/lib/config/dashboard-access"

describe("DASHBOARD_ACCESS_CONFIG", () => {
  it("has all three sections enabled by default", () => {
    expect(DASHBOARD_ACCESS_CONFIG.sections.accounts).toBe("enabled")
    expect(DASHBOARD_ACCESS_CONFIG.sections.centers).toBe("enabled")
    expect(DASHBOARD_ACCESS_CONFIG.sections.prospects).toBe("enabled")
  })

  it("has no prospect limit by default", () => {
    expect(DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount).toBeNull()
  })
})

describe("isSectionEnabled / isSectionDisabled", () => {
  it("returns true for enabled sections", () => {
    expect(isSectionEnabled("accounts")).toBe(true)
    expect(isSectionEnabled("centers")).toBe(true)
  })

  it("returns false for disabled sections", () => {
    expect(isSectionDisabled("accounts")).toBe(false)
  })
})

describe("getEnabledSections", () => {
  it("returns all sections", () => {
    const sections = getEnabledSections()
    expect(sections).toContain("accounts")
    expect(sections).toContain("centers")
    expect(sections).toContain("prospects")
  })
})

describe("getAccessibleDefaultSection", () => {
  it("returns the first enabled section", () => {
    expect(getAccessibleDefaultSection()).toBe("accounts")
  })
})

describe("isDatasetEnabled", () => {
  it("returns true for enabled datasets", () => {
    expect(isDatasetEnabled("accounts")).toBe(true)
    expect(isDatasetEnabled("centers")).toBe(true)
    expect(isDatasetEnabled("prospects")).toBe(true)
    expect(isDatasetEnabled("services")).toBe(true)
  })
})

describe("getProspectsPerAccountLimit", () => {
  it("returns null when no limit is set", () => {
    expect(getProspectsPerAccountLimit()).toBeNull()
  })
})

describe("canAccessAccountsMapView", () => {
  it("returns true when centers are enabled", () => {
    expect(canAccessAccountsMapView()).toBe(true)
  })
})

describe("getSectionUnavailableMessage", () => {
  it("returns formatted message", () => {
    expect(getSectionUnavailableMessage("accounts")).toBe("Accounts is Not Procured.")
    expect(getSectionUnavailableMessage("centers")).toBe("Centers is Not Procured.")
    expect(getSectionUnavailableMessage("prospects")).toBe("Prospects is Not Procured.")
  })
})

describe("getDatasetUnavailableMessage", () => {
  it("returns formatted message", () => {
    expect(getDatasetUnavailableMessage("accounts")).toBe("Accounts export is Not Procured.")
    expect(getDatasetUnavailableMessage("services")).toBe("Services export is Not Procured.")
  })
})

describe("assertSectionEnabled", () => {
  it("does not throw for enabled section", () => {
    expect(() => assertSectionEnabled("accounts")).not.toThrow()
  })
})

describe("assertDatasetEnabled", () => {
  it("does not throw for enabled dataset", () => {
    expect(() => assertDatasetEnabled("accounts")).not.toThrow()
  })
})
