import { describe, expect, it } from "vitest"
import { normalizeUserRole, canExportData, DEFAULT_USER_ROLE } from "@/lib/auth/roles"

describe("normalizeUserRole", () => {
  it("returns 'admin' for admin role", () => {
    expect(normalizeUserRole("admin")).toBe("admin")
  })

  it("returns 'viewer' for viewer role", () => {
    expect(normalizeUserRole("viewer")).toBe("viewer")
  })

  it("normalizes unknown roles to viewer", () => {
    expect(normalizeUserRole("owner")).toBe("viewer")
    expect(normalizeUserRole("superadmin")).toBe("viewer")
    expect(normalizeUserRole("")).toBe("viewer")
  })

  it("normalizes null and undefined to viewer", () => {
    expect(normalizeUserRole(null)).toBe("viewer")
    expect(normalizeUserRole(undefined)).toBe("viewer")
  })

  it("normalizes numbers and objects to viewer", () => {
    expect(normalizeUserRole(0)).toBe("viewer")
    expect(normalizeUserRole({})).toBe("viewer")
    expect(normalizeUserRole([])).toBe("viewer")
  })

  it("has default role set to viewer", () => {
    expect(DEFAULT_USER_ROLE).toBe("viewer")
  })
})

describe("canExportData", () => {
  it("allows admin to export", () => {
    expect(canExportData("admin")).toBe(true)
  })

  it("prevents viewer from exporting", () => {
    expect(canExportData("viewer")).toBe(false)
  })
})
