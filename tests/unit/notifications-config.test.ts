import { describe, expect, it } from "vitest"

describe("notifications enabled logic", () => {
  const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"])
  const DISABLED_VALUES = new Set(["0", "false", "no", "off", "disabled"])

  function isNotificationsEnabled(envVal: string | undefined): boolean {
    const normalized = normalizeEnvValue(envVal)
    if (!normalized) return true
    if (ENABLED_VALUES.has(normalized)) return true
    if (DISABLED_VALUES.has(normalized)) return false
    return true
  }

  function normalizeEnvValue(value: string | undefined): string | null {
    if (typeof value !== "string") return null
    const normalized = value.trim().toLowerCase()
    return normalized || null
  }

  it("defaults to true when env var is not set", () => {
    expect(isNotificationsEnabled(undefined)).toBe(true)
  })

  it("returns true for all enabled values", () => {
    for (const val of ["1", "true", "yes", "on", "enabled"]) {
      expect(isNotificationsEnabled(val)).toBe(true)
    }
  })

  it("returns false for all disabled values", () => {
    for (const val of ["0", "false", "no", "off", "disabled"]) {
      expect(isNotificationsEnabled(val)).toBe(false)
    }
  })

  it("handles whitespace around values", () => {
    expect(isNotificationsEnabled(" true ")).toBe(true)
    expect(isNotificationsEnabled(" false ")).toBe(false)
  })

  it("handles case-insensitive values", () => {
    expect(isNotificationsEnabled("TRUE")).toBe(true)
    expect(isNotificationsEnabled("FALSE")).toBe(false)
  })

  it("defaults to true for unrecognized values", () => {
    expect(isNotificationsEnabled("garbage")).toBe(true)
    expect(isNotificationsEnabled("maybe")).toBe(true)
  })

  it("returns true for empty string", () => {
    expect(isNotificationsEnabled("")).toBe(true)
  })
})
