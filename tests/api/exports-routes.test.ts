import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as listExports } from "@/app/api/exports/route"
import { GET as downloadExport } from "@/app/api/exports/[id]/download/route"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((header: string | null) => (header === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))

const supabaseMocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => authMocks)

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock("@/lib/supabase/server", () => ({
  USER_EXPORTS_BUCKET: "user-exports",
  getSupabaseServiceRoleClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: supabaseMocks.createSignedUrl,
      }),
    },
  }),
}))

describe("export API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    authMocks.extractBearerToken.mockImplementation((header: string | null) =>
      header === "Bearer token-1" ? "token-1" : null
    )
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
  })

  it("rejects export list requests without a bearer token", async () => {
    const res = await listExports(new Request("https://example.com/api/exports"))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Missing authorization token" })
  })

  it("lists exports for the authenticated user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "export-1" }]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const res = await listExports(new Request("https://example.com/api/exports", {
      headers: { authorization: "Bearer token-1" },
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ exports: [{ id: "export-1" }] })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("user_id=eq.user-1"),
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "service-key" }) })
    )
  })

  it("returns 404 when a requested download does not belong to the user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "export-1", user_id: "other-user", filename: "file.xlsx", storage_path: "other/export-1.xlsx" },
    ]), { status: 200 })))

    const res = await downloadExport(
      new Request("https://example.com/api/exports/export-1/download", {
        headers: { authorization: "Bearer token-1", accept: "application/json" },
      }),
      { params: Promise.resolve({ id: "export-1" }) }
    )

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Export not found" })
  })

  it("returns a signed download URL as JSON when requested", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "export-1", user_id: "user-1", filename: "file.xlsx", storage_path: "user-1/export-1.xlsx" },
    ]), { status: 200 })))
    supabaseMocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/file.xlsx" },
      error: null,
    })

    const res = await downloadExport(
      new Request("https://example.com/api/exports/export-1/download", {
        headers: { authorization: "Bearer token-1", accept: "application/json" },
      }),
      { params: Promise.resolve({ id: "export-1" }) }
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ url: "https://signed.example/file.xlsx" })
    expect(supabaseMocks.createSignedUrl).toHaveBeenCalledWith("user-1/export-1.xlsx", 60, {
      download: "file.xlsx",
    })
  })
})
