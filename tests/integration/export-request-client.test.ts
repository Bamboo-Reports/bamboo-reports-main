import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestServerExport, resolveExportDownloadUrl } from "@/lib/exports/request-client"

const getSession = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession },
  }),
}))

describe("export request client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } })
  })

  it("posts the server export request with auth and resolved public IP", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: "203.0.113.20" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "export-1", filename: "a.xlsx", totalRows: 1, rowCounts: { accounts: 1 }, downloadPath: "/d" }), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await requestServerExport({
      datasets: ["accounts"],
      accountNames: ["Acme Corp"],
      centerKeys: null,
      prospectKeys: null,
      isFiltered: true,
      filtersApplied: { country: "India" },
    })

    expect(result.id).toBe("export-1")
    expect(fetchMock).toHaveBeenLastCalledWith("/api/exports/generate", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      body: expect.stringContaining('"clientPublicIp":"203.0.113.20"'),
    }))
  })

  it("continues when public IP lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "export-1", filename: "a.xlsx", totalRows: 1, rowCounts: {}, downloadPath: "/d" }), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    await requestServerExport({
      datasets: ["accounts"],
      accountNames: null,
      centerKeys: null,
      prospectKeys: null,
      isFiltered: false,
      filtersApplied: null,
    })
    expect(fetchMock).toHaveBeenLastCalledWith("/api/exports/generate", expect.objectContaining({
      body: expect.stringContaining('"clientPublicIp":null'),
    }))
  })

  it("throws when no active session exists", async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(requestServerExport({
      datasets: ["accounts"],
      accountNames: null,
      centerKeys: null,
      prospectKeys: null,
      isFiltered: false,
      filtersApplied: null,
    })).rejects.toThrow("No active session")
  })

  it("resolves a signed download URL and validates the response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://signed.example/file" }), { status: 200 })))
    await expect(resolveExportDownloadUrl("export 1")).resolves.toBe("https://signed.example/file")
    expect(fetch).toHaveBeenCalledWith("/api/exports/export%201/download", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
    }))
  })

  it("surfaces API errors with response details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "denied" }), { status: 403 })))
    await expect(resolveExportDownloadUrl("export-1")).rejects.toThrow("Download failed (403): denied")
  })
})
