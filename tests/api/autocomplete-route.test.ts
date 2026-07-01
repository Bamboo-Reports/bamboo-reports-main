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

import { GET as autocomplete } from "@/app/api/accounts/autocomplete/route"

const get = (q: string, auth = true) =>
  autocomplete(new Request(`https://example.com/api/accounts/autocomplete?q=${encodeURIComponent(q)}`, {
    headers: auth ? { authorization: "Bearer token-1" } : {},
  }))

describe("account autocomplete route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (query: { text: string }) => {
      // The autocomplete query is the one selecting the `namematch` column; the
      // other query is the alias lookup (buildAliasMatches).
      if (query.text.includes("namematch")) {
        return [
          { name: "GBX Systems", sw: 1, namematch: 1 },
          { name: "Globex", sw: 0, namematch: 0 },
        ]
      }
      return [{ account_global_legal_name: "Globex", abbreviated_name: "GBX", brand_name: "Widgets Inc", short_legal_name: "Globex Ltd", currently_known_as: null, flagship_products: "SuperWidget" }]
    })
  })

  it("rejects without a token", async () => {
    const res = await get("gbx", false)
    expect(res.status).toBe(401)
  })

  it("returns empty suggestions below the min query length", async () => {
    const res = await get("g")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ suggestions: [] })
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("attaches a matchedAlias only for accounts matched via alias, not by name", async () => {
    const res = await get("gbx")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      suggestions: [
        { value: "GBX Systems" },
        { value: "Globex", matchedAlias: { field: "abbreviated_name", value: "GBX" } },
      ],
    })
  })

  it("returns 500 on warehouse failure", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await get("gbx")
    expect(res.status).toBe(500)
  })
})
