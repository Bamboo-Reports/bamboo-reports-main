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

import { POST as accountsQuery } from "@/app/api/accounts/query/route"
import { POST as centersQuery } from "@/app/api/centers/query/route"
import { POST as prospectsQuery } from "@/app/api/prospects/query/route"

const post = (handler: (r: Request) => Response | Promise<Response>, url: string, body: unknown, auth = true) =>
  handler(new Request(url, {
    method: "POST",
    headers: auth ? { authorization: "Bearer token-1", "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))

describe("entity query routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) =>
      q.text.includes("count(*)") ? [{ total: 1234 }] : [{ account_global_legal_name: "Acme" }]
    )
  })

  it("rejects without a token", async () => {
    const res = await post(accountsQuery, "https://x/api/accounts/query", { filters: {} }, false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 429 }) })
    const res = await post(accountsQuery, "https://x/api/accounts/query", { filters: {} })
    expect(res.status).toBe(429)
  })

  it("returns rows + total + page + pageSize", async () => {
    const res = await post(accountsQuery, "https://x/api/accounts/query", { filters: { accountVisibilityMode: "all" }, page: 2, pageSize: 25 })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ rows: [{ account_global_legal_name: "Acme" }], total: 1234, page: 2, pageSize: 25 })
  })

  it("clamps pageSize to the max and page to >= 1", async () => {
    const res = await post(accountsQuery, "https://x/api/accounts/query", { filters: {}, page: -3, pageSize: 5000 })
    const body = (await res.json()) as { page: number; pageSize: number }
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(100)
  })

  it("only emits ORDER BY for a whitelisted sort column (else default)", async () => {
    let lastRowsSql = ""
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      if (q.text.includes("count(*)")) return [{ total: 0 }]
      lastRowsSql = q.text
      return []
    })
    await post(accountsQuery, "https://x/api/accounts/query", { filters: {}, sort: { column: "account_hq_country", direction: "desc" } })
    expect(lastRowsSql).toContain("order by account_hq_country desc nulls last")

    await post(accountsQuery, "https://x/api/accounts/query", { filters: {}, sort: { column: "drop table; --", direction: "asc" } })
    expect(lastRowsSql).toContain("order by account_global_legal_name asc")
  })

  it("centers and prospects routes work too", async () => {
    const c = await post(centersQuery, "https://x/api/centers/query", { filters: {} })
    const p = await post(prospectsQuery, "https://x/api/prospects/query", { filters: {} })
    expect(c.status).toBe(200)
    expect(p.status).toBe(200)
  })
})
