import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/dashboard/route"

const dataMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((header: string | null) => (header === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))

vi.mock("@/app/actions/data", () => dataMocks)
vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe("dashboard API route", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    dataMocks.getDashboardData.mockResolvedValue({
      accounts: [],
      centers: [],
      functions: [],
      services: [],
      tech: [],
      prospects: [],
      aliases: [],
      lockedProspectTeasers: [],
      error: null,
    })
    await POST(new Request("https://example.com/api/dashboard", {
      headers: { authorization: "Bearer token-1" },
    }))
  })

  it("rejects missing auth", async () => {
    const res = await GET(new Request("https://example.com/api/dashboard"))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Missing authorization token" })
  })

  it("returns dashboard data and marks the first authorized request as a cache miss", async () => {
    const res = await GET(new Request("https://example.com/api/dashboard", {
      headers: { authorization: "Bearer token-1" },
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("MISS")
    await expect(res.json()).resolves.toMatchObject({ accounts: [], centers: [], prospects: [] })
  })

  it("serves fresh data from cache on the next authorized request", async () => {
    await GET(new Request("https://example.com/api/dashboard", {
      headers: { authorization: "Bearer token-1" },
    }))
    const res = await GET(new Request("https://example.com/api/dashboard", {
      headers: { authorization: "Bearer token-1" },
    }))
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(dataMocks.getDashboardData).toHaveBeenCalledTimes(1)
  })

  it("invalidates the dashboard cache with POST", async () => {
    const res = await POST(new Request("https://example.com/api/dashboard", {
      headers: { authorization: "Bearer token-1" },
    }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})
