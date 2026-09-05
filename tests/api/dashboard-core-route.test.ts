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

import { POST as core } from "@/app/api/dashboard/core/route"

const post = (body: unknown, auth = true) =>
  core(new Request("https://example.com/api/dashboard/core", {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("dashboard core route (summary + facets)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    // Order: accF, cenF, proF, svcF, then the unfiltered totals in one row
    warehouseMocks.queryWarehouse
      .mockResolvedValueOnce([{ total: 100 }])
      .mockResolvedValueOnce([{ centers: 250, upcoming: 12, headcount: 5000 }])
      .mockResolvedValueOnce([{ total: 4000 }])
      .mockResolvedValueOnce([{ total: 240 }])
      .mockResolvedValueOnce([{ accounts: 2675, prospects: 63838, services: 6100, centers: 6305, upcoming: 103, headcount: 900000 }])
  })

  it("rejects requests without a bearer token", async () => {
    const res = await post({ filters: {} }, false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("rejects an invalid token", async () => {
    authMocks.resolveAuthenticatedUserId.mockRejectedValueOnce(new Error("bad"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(401)
  })

  it("propagates the rate limiter 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "slow" }), { status: 429 }),
    })
    const res = await post({ filters: {} })
    expect(res.status).toBe(429)
    // The rate-limit RPC now runs concurrently with the compute, so warehouse
    // queries may fire; the 429 still gates the response.
  })

  it("returns summary and facets together from one authed request", async () => {
    warehouseMocks.queryWarehouse.mockReset()
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      if (q.text.includes("as min")) return ["revenue", "yearsInIndia", "centerIncYear"].map((key) => ({ key, min: 5, max: 900 }))
      if (q.text.includes("as facet")) {
        const ids = [...q.text.matchAll(/select (\d+) as facet/g)].map((m) => Number(m[1]))
        return ids.map((facet) => ({ facet, value: "A", count: 5 }))
      }
      if (q.text.includes("as accounts")) return [{ accounts: 2675, prospects: 63838, services: 6100, centers: 6305, upcoming: 103, headcount: 900000 }]
      if (q.text.includes("as centers")) return [{ centers: 250, upcoming: 12, headcount: 5000 }]
      return [{ total: 100 }]
    })
    const res = await post({ filters: {} })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { summary: { filtered: { accounts: number }; full: { accounts: number } }; facets: { options: Record<string, unknown[]>; ranges: { revenue: { min: number } } } }
    expect(body.summary.filtered.accounts).toBe(100)
    expect(body.summary.full.accounts).toBe(2675)
    expect(Object.keys(body.facets.options)).toHaveLength(23)
    expect(body.facets.ranges.revenue.min).toBe(5)
    expect(authMocks.resolveAuthenticatedUserId).toHaveBeenCalledTimes(1)
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledTimes(1)
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ bucket: "dashboard:core" }))
    // 5 summary statements + 1 facet union + 1 ranges statement.
    expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(7)
  })

  it("returns 500 when the warehouse query fails", async () => {
    warehouseMocks.queryWarehouse.mockReset()
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(500)
  })
})
