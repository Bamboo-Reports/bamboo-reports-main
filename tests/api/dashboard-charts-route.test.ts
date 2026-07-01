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

import { POST as charts } from "@/app/api/dashboard/charts/route"

const post = (body: unknown, auth = true) =>
  charts(new Request("https://example.com/api/dashboard/charts", {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("dashboard charts route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
  })

  it("rejects without a token", async () => {
    const res = await post({ filters: {} }, false)
    expect(res.status).toBe(401)
  })

  it("applies top-10 slicing and city top-5 + Others", async () => {
    // City column: 7 distinct values with distinct counts -> top5 + Others.
    const city = Array.from({ length: 7 }, (_, i) => ({ name: `City${i}`, value: 70 - i * 10 }))
    // A 12-value field -> sliced to 10.
    const big = Array.from({ length: 12 }, (_, i) => ({ name: `V${i}`, value: 120 - i }))
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      if (q.text.includes("center_city")) return city
      return big
    })

    const res = await post({ filters: { accountVisibilityMode: "all" } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      account: { regionData: unknown[] }
      center: { cityData: { name: string; value: number }[] }
      prospect: { departmentData: unknown[] }
    }
    // top-10 slice
    expect(body.account.regionData).toHaveLength(10)
    expect(body.prospect.departmentData).toHaveLength(10)
    // city: top 5 + Others (sum of the remaining two: 20 + 10 = 30)
    expect(body.center.cityData).toHaveLength(6)
    expect(body.center.cityData[5]).toEqual({ name: "Others", value: 30 })
  })

  it("returns 500 on warehouse failure", async () => {
    warehouseMocks.queryWarehouse.mockRejectedValue(new Error("db down"))
    const res = await post({ filters: {} })
    expect(res.status).toBe(500)
  })
})
