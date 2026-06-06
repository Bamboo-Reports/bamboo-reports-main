import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/accounts/ai-summary/route"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((header: string | null) => header === "Bearer token-1" ? "token-1" : null),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))

const summaryMocks = vi.hoisted(() => ({
  buildAccountSummaryContext: vi.fn(),
  generateAccountSummary: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/ai/account-summary-context", () => ({
  buildAccountSummaryContext: summaryMocks.buildAccountSummaryContext,
}))
vi.mock("@/lib/ai/account-summary-generator", () => ({
  generateAccountSummary: summaryMocks.generateAccountSummary,
}))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

function request(body: unknown, authenticated = true) {
  return new Request("https://example.com/api/accounts/ai-summary", {
    method: "POST",
    headers: {
      ...(authenticated ? { authorization: "Bearer token-1" } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

describe("account AI summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key")
    vi.stubEnv("AI_ACCOUNT_SUMMARY_ENABLED", "true")
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    summaryMocks.buildAccountSummaryContext.mockResolvedValue({ account: { name: "Acme Corp" } })
    summaryMocks.generateAccountSummary.mockResolvedValue({
      summary: {
        summary: "Acme is a technology company with an established India presence.",
      },
      generatedAt: "2026-06-06T00:00:00.000Z",
      model: "deepseek/deepseek-v4-flash",
    })
  })

  it("rejects unauthenticated requests", async () => {
    const response = await POST(request({ accountName: "Acme Corp" }, false))
    expect(response.status).toBe(401)
  })

  it("rejects invalid request bodies", async () => {
    const response = await POST(request({ accountName: "" }))
    expect(response.status).toBe(400)
    expect(summaryMocks.buildAccountSummaryContext).not.toHaveBeenCalled()
  })

  it("returns 404 for an unknown account", async () => {
    summaryMocks.buildAccountSummaryContext.mockResolvedValue(null)
    const response = await POST(request({ accountName: "Missing" }))
    expect(response.status).toBe(404)
    expect(summaryMocks.generateAccountSummary).not.toHaveBeenCalled()
  })

  it("generates a structured account brief", async () => {
    const response = await POST(request({ accountName: "Acme Corp" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      summary: { summary: "Acme is a technology company with an established India presence." },
      model: "deepseek/deepseek-v4-flash",
    })
  })

  it("reports missing OpenRouter configuration", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    const response = await POST(request({ accountName: "Acme Corp" }))
    expect(response.status).toBe(503)
    expect(summaryMocks.buildAccountSummaryContext).not.toHaveBeenCalled()
  })
})
