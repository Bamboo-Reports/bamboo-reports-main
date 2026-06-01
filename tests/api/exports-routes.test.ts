import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as listExports } from "@/app/api/exports/route"
import { GET as downloadExport } from "@/app/api/exports/[id]/download/route"
import { POST as generateExport } from "@/app/api/exports/generate/route"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((header: string | null) => (header === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))

const supabaseMocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  profileMaybeSingle: vi.fn(),
  rateLimitGte: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  exportInsertSingle: vi.fn(),
}))

const exportBuilderMocks = vi.hoisted(() => ({
  buildServerExport: vi.fn(),
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
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: supabaseMocks.profileMaybeSingle,
            }),
          }),
        }
      }

      if (table === "user_exports") {
        return {
          select: () => ({
            eq: () => ({
              gte: supabaseMocks.rateLimitGte,
            }),
          }),
          insert: () => ({
            select: () => ({
              single: supabaseMocks.exportInsertSingle,
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
    storage: {
      from: () => ({
        createSignedUrl: supabaseMocks.createSignedUrl,
        upload: supabaseMocks.storageUpload,
        remove: supabaseMocks.storageRemove,
      }),
    },
  }),
}))

vi.mock("@/lib/exports/server-builder", () => ({
  buildServerExport: exportBuilderMocks.buildServerExport,
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
    supabaseMocks.profileMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null })
    supabaseMocks.rateLimitGte.mockResolvedValue({ count: 0, error: null })
    supabaseMocks.storageUpload.mockResolvedValue({ error: null })
    supabaseMocks.storageRemove.mockResolvedValue({ error: null })
    supabaseMocks.exportInsertSingle.mockResolvedValue({
      data: { id: "export-1", filename: "file.xlsx" },
      error: null,
    })
    exportBuilderMocks.buildServerExport.mockResolvedValue({
      buffer: Buffer.from("xlsx"),
      rowCounts: { accounts: 1 },
      totalRows: 1,
    })
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

  it("rejects export generation for non-admin users before building a workbook", async () => {
    supabaseMocks.profileMaybeSingle.mockResolvedValue({ data: { role: "viewer" }, error: null })

    const res = await generateExport(new Request("https://example.com/api/exports/generate", {
      method: "POST",
      headers: { authorization: "Bearer token-1" },
      body: JSON.stringify({ datasets: ["accounts"] }),
    }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: "Export access denied" })
    expect(exportBuilderMocks.buildServerExport).not.toHaveBeenCalled()
    expect(supabaseMocks.storageUpload).not.toHaveBeenCalled()
  })

  it("rejects export generation when the authenticated user has no profile role", async () => {
    supabaseMocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await generateExport(new Request("https://example.com/api/exports/generate", {
      method: "POST",
      headers: { authorization: "Bearer token-1" },
      body: JSON.stringify({ datasets: ["accounts"] }),
    }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: "Export access denied" })
    expect(exportBuilderMocks.buildServerExport).not.toHaveBeenCalled()
    expect(supabaseMocks.rateLimitGte).not.toHaveBeenCalled()
  })

  it("allows admin users to generate exports after the server-side role check", async () => {
    const res = await generateExport(new Request("https://example.com/api/exports/generate", {
      method: "POST",
      headers: { authorization: "Bearer token-1" },
      body: JSON.stringify({ datasets: ["accounts"] }),
    }))

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual(expect.objectContaining({
      filename: expect.stringMatching(/^dashboard-export-.*\.xlsx$/),
      rowCounts: { accounts: 1 },
      totalRows: 1,
    }))
    expect(supabaseMocks.profileMaybeSingle).toHaveBeenCalled()
    expect(supabaseMocks.rateLimitGte).toHaveBeenCalled()
    expect(exportBuilderMocks.buildServerExport).toHaveBeenCalledWith({
      datasets: ["accounts"],
      accountNames: null,
      centerKeys: null,
      prospectKeys: null,
    })
    expect(supabaseMocks.storageUpload).toHaveBeenCalled()
    expect(supabaseMocks.exportInsertSingle).toHaveBeenCalled()
  })
})
