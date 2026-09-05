import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

import { GET as related } from "@/app/api/accounts/[name]/related/route"

const ACCOUNT = { account_global_legal_name: "Acme plc" }
const CENTER = { cn_unique_key: "c-1", account_global_legal_name: "Acme plc" }
const PROSPECT = { ps_unique_key: "p-1", account_global_legal_name: "Acme plc" }

const call = (name: string, auth = true, headers: Record<string, string> = {}) =>
  related(new Request("https://x/api", { headers: auth ? { authorization: "Bearer token-1", ...headers } : headers }), {
    params: Promise.resolve({ name: encodeURIComponent(name) }),
  })

describe("account related route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      // The services statement mentions centers in its subquery; test it first.
      if (q.text.includes("from services")) return []
      if (q.text.includes("from accounts")) return [ACCOUNT]
      if (q.text.includes("from centers")) return [CENTER]
      if (q.text.includes("from prospects")) return [PROSPECT]
      return []
    })
  })

  it("rejects without a token", async () => {
    expect((await call("Acme plc", false)).status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("returns the account with its centers, services, tech and prospects", async () => {
    const res = await call("Acme plc")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ account: ACCOUNT, centers: [CENTER], services: [], tech: [], prospects: [PROSPECT] })
    expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(5)
  })

  it("404s on an unknown account", async () => {
    warehouseMocks.queryWarehouse.mockResolvedValue([])
    expect((await call("nope")).status).toBe(404)
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: false, response: new Response("{}", { status: 429 }) })
    expect((await call("Acme plc")).status).toBe(429)
  })

  describe("response caching", () => {
    beforeEach(async () => {
      process.env.DASHBOARD_CACHE_TTL_MS = "600000"
      const { clearCache } = await import("@/lib/cache/memory")
      clearCache()
    })
    afterEach(() => {
      process.env.DASHBOARD_CACHE_TTL_MS = "0"
    })

    it("serves a reopened account from cache without warehouse queries", async () => {
      await call("Acme plc")
      expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(5)
      const second = await call("Acme plc")
      expect(second.status).toBe(200)
      expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(5)
      // The rate limit still applies to cached responses.
      expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledTimes(2)
    })

    it("x-no-cache recomputes", async () => {
      await call("Acme plc")
      await call("Acme plc", true, { "x-no-cache": "1" })
      expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(10)
    })
  })
})
