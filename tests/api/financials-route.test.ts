import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((header: string | null) => (header === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))

const rateLimitMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}))

const financeMocks = vi.hoisted(() => ({
  fetchAccountFinancialInfo: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/rate-limit/server", () => rateLimitMocks)
vi.mock("@/lib/finance/financial-info", () => financeMocks)
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { GET as getFinancials } from "@/app/api/financials/route"

const url = "https://example.com/api/financials?ticker=AAPL"

describe("financials API route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((header: string | null) =>
      header === "Bearer token-1" ? "token-1" : null
    )
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    financeMocks.fetchAccountFinancialInfo.mockResolvedValue({
      success: true,
      error: null,
      data: { symbol: "AAPL" },
    })
  })

  it("rejects requests without a bearer token", async () => {
    const res = await getFinancials(new Request(url))
    expect(res.status).toBe(401)
    expect(financeMocks.fetchAccountFinancialInfo).not.toHaveBeenCalled()
  })

  it("rejects an invalid or expired token", async () => {
    authMocks.resolveAuthenticatedUserId.mockRejectedValueOnce(new Error("invalid"))
    const res = await getFinancials(new Request(url, { headers: { authorization: "Bearer token-1" } }))
    expect(res.status).toBe(401)
  })

  it("propagates the rate limiter's 429 response", async () => {
    const limited = new Response(JSON.stringify({ error: "slow down" }), {
      status: 429,
      headers: { "Retry-After": "30" },
    })
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: limited })
    const res = await getFinancials(new Request(url, { headers: { authorization: "Bearer token-1" } }))
    expect(res.status).toBe(429)
    expect(financeMocks.fetchAccountFinancialInfo).not.toHaveBeenCalled()
  })

  it("returns 400 when the ticker is missing", async () => {
    const res = await getFinancials(
      new Request("https://example.com/api/financials", { headers: { authorization: "Bearer token-1" } })
    )
    expect(res.status).toBe(400)
    expect(financeMocks.fetchAccountFinancialInfo).not.toHaveBeenCalled()
  })

  it("returns financial data for an authenticated, within-budget request", async () => {
    const res = await getFinancials(new Request(url, { headers: { authorization: "Bearer token-1" } }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, error: null, data: { symbol: "AAPL" } })
    expect(financeMocks.fetchAccountFinancialInfo).toHaveBeenCalledWith("AAPL")
  })
})
