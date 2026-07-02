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

import { POST as centersMap } from "@/app/api/centers/map/route"

const CITY_ROW = { city: "Bengaluru", country: "India", lat: 12.97, lng: 77.59, count: 40, accounts_count: 25, headcount: 12000 }
const STATE_ROW = { country_iso2: "IN", state_key: "karnataka", country_name: "India", count: 55, accounts_count: 30, headcount: 15000 }

const post = (body: unknown, auth = true) =>
  centersMap(new Request("https://x/api/centers/map", {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("POST /api/centers/map", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    // The city query is the one carrying array_agg; the state query selects country_iso2.
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) =>
      q.text.includes("array_agg") ? [CITY_ROW] : [STATE_ROW]
    )
  })

  it("rejects without a token", async () => {
    const res = await post({ filters: {} }, false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 429 }) })
    const res = await post({ filters: {} })
    expect(res.status).toBe(429)
  })

  it("returns mapped cities and states", async () => {
    const res = await post({ filters: { accountVisibilityMode: "all" } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      cities: [{ city: "Bengaluru", country: "India", lat: 12.97, lng: 77.59, count: 40, accountsCount: 25, headcount: 12000 }],
      states: [{ countryIso2: "IN", stateKey: "karnataka", countryName: "India", count: 55, accountsCount: 30, headcount: 15000 }],
    })
    expect(warehouseMocks.queryWarehouse).toHaveBeenCalledTimes(2)
  })

  it("falls back to the ISO2 when a state group has no country name", async () => {
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) =>
      q.text.includes("array_agg") ? [] : [{ ...STATE_ROW, country_name: null }]
    )
    const res = await post({ filters: {} })
    const body = (await res.json()) as { states: Array<{ countryName: string }> }
    expect(body.states[0].countryName).toBe("IN")
  })

  it("returns 500 when a warehouse query fails", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("boom"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(500)
  })
})
