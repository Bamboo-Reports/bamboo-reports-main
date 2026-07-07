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

import { POST as facets } from "@/app/api/dashboard/facets/route"

const post = (body: unknown, auth = true) =>
  facets(new Request("https://example.com/api/dashboard/facets", {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("dashboard facets route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      if (q.text.includes("as min")) return [{ min: 5, max: 900 }]
      return [{ value: "B", count: 2 }, { value: "A", count: 5 }]
    })
  })

  it("rejects without a bearer token", async () => {
    const res = await post({ filters: {} }, false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 429 }) })
    const res = await post({ filters: {} })
    expect(res.status).toBe(429)
  })

  it("returns all facet option lists (sorted desc) plus ranges", async () => {
    const res = await post({ filters: {} })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { options: Record<string, { value: string; count: number }[]>; ranges: Record<string, { min: number; max: number }> }
    // 23 facet keys present, each sorted by count desc.
    expect(Object.keys(body.options)).toHaveLength(23)
    expect(body.options.accountHqCountryValues).toEqual([{ value: "A", count: 5 }, { value: "B", count: 2 }])
    expect(body.ranges).toEqual({ revenue: { min: 5, max: 900 }, yearsInIndia: { min: 5, max: 900 }, centerIncYear: { min: 5, max: 900 } })
  })

  it("returns 500 when the warehouse fails", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(500)
  })

  describe("response caching (#249 perf)", () => {
    beforeEach(async () => {
      process.env.DASHBOARD_CACHE_TTL_MS = "600000"
      const { clearCache } = await import("@/lib/cache/memory")
      clearCache()
    })
    afterEach(() => {
      process.env.DASHBOARD_CACHE_TTL_MS = "0"
    })

    it("serves the second identical request from cache (no warehouse queries)", async () => {
      const first = await post({ filters: {} })
      expect(first.status).toBe(200)
      const callsAfterFirst = warehouseMocks.queryWarehouse.mock.calls.length
      expect(callsAfterFirst).toBeGreaterThan(0)

      const second = await post({ filters: {} })
      expect(second.status).toBe(200)
      expect(warehouseMocks.queryWarehouse.mock.calls.length).toBe(callsAfterFirst)
      expect(await second.json()).toEqual(await first.json())
    })

    it("different filters use different cache entries", async () => {
      await post({ filters: {} })
      const callsAfterFirst = warehouseMocks.queryWarehouse.mock.calls.length
      await post({ filters: { accountVisibilityMode: "all" } })
      expect(warehouseMocks.queryWarehouse.mock.calls.length).toBeGreaterThan(callsAfterFirst)
    })

    it("x-no-cache bypasses the cache read and recomputes", async () => {
      await post({ filters: {} })
      const callsAfterFirst = warehouseMocks.queryWarehouse.mock.calls.length

      const res = await facets(new Request("https://example.com/api/dashboard/facets", {
        method: "POST",
        headers: { authorization: "Bearer token-1", "content-type": "application/json", "x-no-cache": "1" },
        body: JSON.stringify({ filters: {} }),
      }))
      expect(res.status).toBe(200)
      expect(warehouseMocks.queryWarehouse.mock.calls.length).toBeGreaterThan(callsAfterFirst)
    })
  })
})
