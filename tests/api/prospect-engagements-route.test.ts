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

import { GET } from "@/app/api/prospects/[id]/engagements/route"

const ROWS = [
  { prospect_engaged_date: "29-July-2026", prospect_engaged_campaign: "BR Q2 2026 Registration Campaign" },
  { prospect_engaged_date: "8-September-2026", prospect_engaged_campaign: "BR Q2 2026 Download Campaign" },
]

const call = (id: string, auth = true) =>
  GET(new Request("https://x/api", { headers: auth ? { authorization: "Bearer token-1" } : {} }), {
    params: Promise.resolve({ id }),
  })

describe("prospect engagements route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockResolvedValue(ROWS)
  })

  it("rejects without a token", async () => {
    expect((await call("p-1", false)).status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("returns the prospect's engagements oldest first", async () => {
    const res = await call("p-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.engagements.map((e: { prospect_engaged_date: string }) => e.prospect_engaged_date)).toEqual([
      "29-July-2026",
      "8-September-2026",
    ])
  })

  it("matches subscribers by lowercased email and passes the key as a parameter", async () => {
    await call("p-1")
    const [query] = warehouseMocks.queryWarehouse.mock.calls[0]
    expect(query.text).toContain("lower(prospect_email)")
    expect(query.text).toContain("from subscribers")
    expect(query.values).toEqual(["p-1"])
  })

  it("returns an empty list for a prospect with no activity", async () => {
    warehouseMocks.queryWarehouse.mockResolvedValue([])
    const res = await call("p-2")
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ engagements: [] })
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: false, response: new Response("{}", { status: 429 }) })
    expect((await call("p-1")).status).toBe(429)
  })

  it("returns 500 when the warehouse query fails", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("boom"))
    expect((await call("p-1")).status).toBe(500)
  })
})
