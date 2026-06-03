import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  DASHBOARD_ACCESS_CONFIG,
  assertDatasetEnabled,
  assertSectionEnabled,
  canAccessAccountsMapView,
  getAccessibleDefaultSection,
  getDatasetUnavailableMessage,
  getEnabledSections,
  getProspectsPerAccountLimit,
  getSectionUnavailableMessage,
  isDatasetEnabled,
  isSectionDisabled,
  isSectionEnabled,
} from "@/lib/config/dashboard-access"

describe("dashboard access config", () => {
  const originalConfig = JSON.parse(JSON.stringify(DASHBOARD_ACCESS_CONFIG))

  beforeEach(() => {
    // Reset config before each test to ensure tests are isolated
    Object.assign(DASHBOARD_ACCESS_CONFIG, JSON.parse(JSON.stringify(originalConfig)))
  })

  afterEach(() => {
    // Restore config
    Object.assign(DASHBOARD_ACCESS_CONFIG, JSON.parse(JSON.stringify(originalConfig)))
  })

  describe("sections", () => {
    it("identifies enabled and disabled sections", () => {
      DASHBOARD_ACCESS_CONFIG.sections.accounts = "enabled"
      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"

      expect(isSectionEnabled("accounts")).toBe(true)
      expect(isSectionDisabled("accounts")).toBe(false)

      expect(isSectionEnabled("centers")).toBe(false)
      expect(isSectionDisabled("centers")).toBe(true)
    })

    it("returns enabled sections array", () => {
      DASHBOARD_ACCESS_CONFIG.sections.accounts = "enabled"
      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      DASHBOARD_ACCESS_CONFIG.sections.prospects = "enabled"

      expect(getEnabledSections()).toEqual(["accounts", "prospects"])
    })

    it("returns accessible default section", () => {
      DASHBOARD_ACCESS_CONFIG.sections.accounts = "disabled"
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      
      expect(getAccessibleDefaultSection()).toBe("centers")

      // when all disabled, falls back to "accounts"
      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      DASHBOARD_ACCESS_CONFIG.sections.prospects = "disabled"
      expect(getAccessibleDefaultSection()).toBe("accounts")
    })
  })

  describe("datasets", () => {
    it("evaluates dataset enabled state", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      DASHBOARD_ACCESS_CONFIG.sections.accounts = "enabled"

      expect(isDatasetEnabled("services")).toBe(false)
      expect(isDatasetEnabled("centers")).toBe(false)
      expect(isDatasetEnabled("accounts")).toBe(true)
    })
  })

  describe("limits", () => {
    it("returns null if limit is null", () => {
      DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount = null
      expect(getProspectsPerAccountLimit()).toBeNull()
    })

    it("returns null if limit is not finite", () => {
      DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount = Infinity as any
      expect(getProspectsPerAccountLimit()).toBeNull()

      DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount = NaN as any
      expect(getProspectsPerAccountLimit()).toBeNull()
    })

    it("returns floored positive integer", () => {
      DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount = 5.7
      expect(getProspectsPerAccountLimit()).toBe(5)

      DASHBOARD_ACCESS_CONFIG.limits.prospectsPerAccount = -5
      expect(getProspectsPerAccountLimit()).toBe(0)
    })
  })

  describe("view access", () => {
    it("canAccessAccountsMapView maps to centers section", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      expect(canAccessAccountsMapView()).toBe(true)

      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      expect(canAccessAccountsMapView()).toBe(false)
    })
  })

  describe("messages and assertions", () => {
    it("provides unavailability messages", () => {
      expect(getSectionUnavailableMessage("centers")).toBe("Centers is Not Procured.")
      expect(getDatasetUnavailableMessage("services")).toBe("Services export is Not Procured.")
    })

    it("asserts section is enabled", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      expect(() => assertSectionEnabled("centers")).not.toThrow()

      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      expect(() => assertSectionEnabled("centers")).toThrow("Centers is Not Procured.")
    })

    it("asserts dataset is enabled", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      expect(() => assertDatasetEnabled("services")).not.toThrow()

      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      expect(() => assertDatasetEnabled("services")).toThrow("Services export is Not Procured.")
    })
  })
})
