import { describe, expect, it, beforeEach, afterEach } from "vitest"
import {
  DASHBOARD_ACCESS_CONFIG,
  assertDatasetEnabled,
  assertSectionEnabled,
  canAccessAccountsMapView,
  getAccessibleDefaultSection,
  getDatasetUnavailableMessage,
  getEnabledSections,
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
      expect(getSectionUnavailableMessage("centers")).toBe("Centres is Not Procured.")
      expect(getDatasetUnavailableMessage("services")).toBe("Services export is Not Procured.")
    })

    it("asserts section is enabled", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      expect(() => assertSectionEnabled("centers")).not.toThrow()

      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      expect(() => assertSectionEnabled("centers")).toThrow("Centres is Not Procured.")
    })

    it("asserts dataset is enabled", () => {
      DASHBOARD_ACCESS_CONFIG.sections.centers = "enabled"
      expect(() => assertDatasetEnabled("services")).not.toThrow()

      DASHBOARD_ACCESS_CONFIG.sections.centers = "disabled"
      expect(() => assertDatasetEnabled("services")).toThrow("Services export is Not Procured.")
    })
  })
})
