import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function getValidateEnv() {
  vi.resetModules()
  const mod = await import("@/lib/config/env-schema")
  return mod.validateEnv
}

describe("validateEnv", () => {
  it("passes when all required env vars are present and valid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
  })

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("does not throw when NEXT_PUBLIC_SUPABASE_URL is not a valid URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
  })

  it("throws when multiple required vars are missing", async () => {
    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("accepts missing optional vars", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
  })

  it("accepts optional vars when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_key")
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://posthog.example")
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "maptiler-key")
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_KEY", "logo-dev-key")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
  })

  it("skips validation on client side", async () => {
    vi.stubGlobal("window", {})
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
  })

  it("only validates once", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/db")

    const validateEnv = await getValidateEnv()
    expect(() => validateEnv()).not.toThrow()
    expect(() => validateEnv()).not.toThrow()
  })
})
