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

  it("surfaces API errors when JSON parsing fails in requestServerExport", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: "203.0.113.20" }), { status: 200 }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
        text: () => Promise.resolve("Internal Server Error Text"),
      })
    vi.stubGlobal("fetch", fetchMock)

    await expect(requestServerExport({
      datasets: ["accounts"],
      accountNames: null,
      centerKeys: null,
      prospectKeys: null,
      isFiltered: false,
      filtersApplied: null,
    })).rejects.toThrow("Export failed (500): Internal Server Error Text")
  })

  it("surfaces API errors when both JSON and text parsing fail in requestServerExport", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ip: "203.0.113.20" }), { status: 200 }))
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("invalid json")),
        text: () => Promise.reject(new Error("invalid text")),
      })
    vi.stubGlobal("fetch", fetchMock)

    await expect(requestServerExport({
      datasets: ["accounts"],
      accountNames: null,
      centerKeys: null,
      prospectKeys: null,
      isFiltered: false,
      filtersApplied: null,
    })).rejects.toThrow("Export failed (502): no detail")
  })

  it("throws when no active session exists for download", async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(resolveExportDownloadUrl("export-1")).rejects.toThrow("No active session; cannot download export.")
  })

  it("surfaces API errors when JSON parsing fails in resolveExportDownloadUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.reject(new Error("not json")),
      text: () => Promise.resolve("Not Found Text"),
    }))
    await expect(resolveExportDownloadUrl("export-1")).rejects.toThrow("Download failed (404): Not Found Text")
  })

  it("throws when payload url is missing in resolveExportDownloadUrl", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ notUrl: "hello" }), { status: 200 })))
    await expect(resolveExportDownloadUrl("export-1")).rejects.toThrow("Download URL missing from response.")
  })
})
