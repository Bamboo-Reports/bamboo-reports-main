import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((h: string | null) => (h === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))
const rateLimitMocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }))
const warehouseMocks = vi.hoisted(() => ({ queryWarehouse: vi.fn() }))

vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/rate-limit/server", () => rateLimitMocks)
vi.mock("@/lib/db/warehouse", () => warehouseMocks)
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { POST as match } from "@/app/api/accounts/match/route"

const post = (body: unknown, auth = true) =>
  match(
    new Request("https://example.com/api/accounts/match", {
      method: "POST",
      headers: { ...(auth ? { authorization: "Bearer token-1" } : {}), "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )

describe("account match route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (query: { text: string }) => {
      if (query.text.includes("from alias")) {
        return [{ account_global_legal_name: "Globex Corporation", abbreviated_name: "GBX", brand_name: null, short_legal_name: null, currently_known_as: null }]
      }
      return [
        { name: "Globex Corporation", visibility: "exclude", visibility_note: "GCC only" },
        { name: "Infosys Limited", visibility: "include", visibility_note: null },
      ]
    })
  })

  it("rejects without a token", async () => {
    expect((await post({ names: ["Infosys"] }, false)).status).toBe(401)
  })

  it("rejects invalid bodies", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post({ names: [] })).status).toBe(400)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("returns a result per input name", async () => {
    const res = await post({ names: ["infosys ltd", "gbx", "Nobody"] })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { results: Array<Record<string, unknown>> }
    expect(body.results.map((r) => [r.input, r.status])).toEqual([
      ["infosys ltd", "matched"],
      ["gbx", "matched"],
      ["Nobody", "not_found"],
    ])
    expect(body.results[1].match).toMatchObject({ name: "Globex Corporation", via: "alias", aliasValue: "GBX", visibility: { visibility: "exclude", note: "GCC only" } })
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", bucket: "accounts:match" }))
  })

  it("returns the rate limit response when exceeded", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: false, response: new Response("slow down", { status: 429 }) })
    expect((await post({ names: ["Infosys"] })).status).toBe(429)
  })
})
