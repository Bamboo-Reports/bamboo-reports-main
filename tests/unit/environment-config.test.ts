import { describe, expect, it } from "vitest"

describe("getEnvironmentLabel logic", () => {
  it("returns null when env var is not set", () => {
    const value = normalizeLabel(undefined)
    expect(value).toBeNull()
  })

  it("returns null for empty string", () => {
    const value = normalizeLabel("")
    expect(value).toBeNull()
  })

  it("returns null for whitespace-only", () => {
    const value = normalizeLabel("   ")
    expect(value).toBeNull()
  })

  it("returns uppercased label when set", () => {
    const value = normalizeLabel("staging")
    expect(value).toBe("STAGING")
  })

  it("preserves already uppercased labels", () => {
    const value = normalizeLabel("PRODUCTION")
    expect(value).toBe("PRODUCTION")
  })

  it("trims surrounding whitespace", () => {
    const value = normalizeLabel("  dev  ")
    expect(value).toBe("DEV")
  })
})

function normalizeLabel(label: string | undefined): string | null {
  if (typeof label !== "string") return null
  const trimmed = label.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

describe("getLogoDevPublicKey logic", () => {
  it("returns null when neither env var is set", () => {
    expect(resolveLogoKey(null, null)).toBeNull()
  })

  it("returns LOGO_DEV_KEY when set", () => {
    expect(resolveLogoKey("key-123", null)).toBe("key-123")
  })

  it("falls back to LOGO_DEV_TOKEN when key is not set", () => {
    expect(resolveLogoKey(null, "token-456")).toBe("token-456")
  })

  it("prefers LOGO_DEV_KEY over LOGO_DEV_TOKEN", () => {
    expect(resolveLogoKey("key-123", "token-456")).toBe("key-123")
  })

  it("returns null when both are whitespace-only", () => {
    expect(resolveLogoKey("  ", "  ")).toBeNull()
  })
})

function resolveLogoKey(key: string | null, token: string | null): string | null {
  const keyVal = key?.trim() || null
  const tokenVal = token?.trim() || null
  return keyVal ?? tokenVal
}
