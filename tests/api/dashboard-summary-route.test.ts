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

import { POST as summary } from "@/app/api/dashboard/summary/route"

const post = (body: unknown, auth = true) =>
  summary(new Request("https://example.com/api/dashboard/summary", {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("dashboard summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    // Order: accF, cenF, proF, svcF, accAll, cenAll, proAll, svcAll
    warehouseMocks.queryWarehouse
      .mockResolvedValueOnce([{ total: 100 }])
      .mockResolvedValueOnce([{ centers: 250, upcoming: 12, headcount: 5000 }])
      .mockResolvedValueOnce([{ total: 4000 }])
      .mockResolvedValueOnce([{ total: 240 }])
      .mockResolvedValueOnce([{ total: 2675 }])
      .mockResolvedValueOnce([{ centers: 6305, upcoming: 103, headcount: 900000 }])
      .mockResolvedValueOnce([{ total: 63838 }])
      .mockResolvedValueOnce([{ total: 6100 }])
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
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("returns filtered + full metrics for an authenticated request", async () => {
    const res = await post({ filters: { accountVisibilityMode: "all" } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      filtered: { accounts: 100, centers: 250, upcomingCenters: 12, prospects: 4000, headcount: 5000, services: 240 },
      full: { accounts: 2675, centers: 6305, upcomingCenters: 103, prospects: 63838, headcount: 900000, services: 6100 },
    })
    expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(8)
  })

  it("returns 500 when the warehouse query fails", async () => {
    warehouseMocks.queryWarehouse.mockReset()
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(500)
  })
})
