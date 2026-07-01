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

import { GET as search } from "@/app/api/search/route"

const get = (q: string, auth = true) =>
  search(new Request(`https://example.com/api/search?q=${encodeURIComponent(q)}`, {
    headers: auth ? { authorization: "Bearer token-1" } : {},
  }))

describe("search route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (query: { text: string }) => {
      if (query.text.includes("count(*)")) return [{ total: 3 }]
      if (query.text.includes("from accounts")) return [{ id: "Acme Corp", industry: "Software", country: "United States" }]
      if (query.text.includes("from centers")) return [{ id: "c1", title: "Acme NYC", city: "New York", state: "NY", country: "United States" }]
      return [{ id: "p1", fullname: "Jane Smith", title: "VP", account: "Acme Corp" }]
    })
  })

  it("rejects without a token", async () => {
    const res = await get("acme", false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("returns empty groups for a query shorter than 2 chars (no DB hit)", async () => {
    const res = await get("a")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      accounts: { items: [], totalMatches: 0 },
      centers: { items: [], totalMatches: 0 },
      prospects: { items: [], totalMatches: 0 },
      total: 0,
    })
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 429 }) })
    const res = await get("acme")
    expect(res.status).toBe(429)
  })

  it("returns grouped results with titles/subtitles and totals", async () => {
    const res = await get("acme")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      accounts: { items: { title: string; subtitle: string }[]; totalMatches: number }
      centers: { items: { subtitle: string }[] }
      prospects: { items: { title: string; subtitle: string }[] }
      total: number
    }
    expect(body.accounts.items[0]).toEqual({ type: "account", id: "Acme Corp", title: "Acme Corp", subtitle: "Software · United States" })
    expect(body.centers.items[0].subtitle).toBe("New York, NY, United States")
    expect(body.prospects.items[0]).toEqual({ type: "prospect", id: "p1", title: "Jane Smith", subtitle: "VP · Acme Corp" })
    expect(body.accounts.totalMatches).toBe(3)
    expect(body.total).toBe(9)
  })

  it("returns 500 on warehouse failure", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await get("acme")
    expect(res.status).toBe(500)
  })
})
