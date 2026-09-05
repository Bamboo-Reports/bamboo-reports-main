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

import { GET as centerDetail } from "@/app/api/centers/[key]/route"
import { GET as prospectDetail } from "@/app/api/prospects/[id]/route"

const CENTER = { cn_unique_key: "c-1", center_name: "Acme GCC" }
const SERVICE = { cn_unique_key: "c-1", primary_service: "IT" }
const TECH = { cn_unique_key: "c-1", software_in_use: "SAP" }
const PROSPECT = { ps_unique_key: "p-1", prospect_full_name: "Jane Roe" }

const call = <P,>(handler: (r: Request, ctx: { params: Promise<P> }) => Promise<Response>, param: P, auth = true) =>
  handler(new Request("https://x/api", { headers: auth ? { authorization: "Bearer token-1" } : {} }), {
    params: Promise.resolve(param),
  })

describe("center and prospect lookup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string }) => {
      if (q.text.includes("from services")) return [SERVICE]
      if (q.text.includes("from tech")) return [TECH]
      if (q.text.includes("from centers")) return [CENTER]
      if (q.text.includes("from prospects")) return [PROSPECT]
      return []
    })
  })

  it("rejects without a token", async () => {
    expect((await call(centerDetail, { key: "c-1" }, false)).status).toBe(401)
    expect((await call(prospectDetail, { id: "p-1" }, false)).status).toBe(401)
  })

  it("returns the center with its services and tech", async () => {
    const res = await call(centerDetail, { key: "c-1" })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ center: CENTER, services: [SERVICE], tech: [TECH] })
  })

  it("returns the prospect by key", async () => {
    const res = await call(prospectDetail, { id: "p-1" })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ prospect: PROSPECT })
  })

  it("404s on unknown keys", async () => {
    warehouseMocks.queryWarehouse.mockResolvedValue([])
    expect((await call(centerDetail, { key: "nope" })).status).toBe(404)
    expect((await call(prospectDetail, { id: "nope" })).status).toBe(404)
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: false, response: new Response("{}", { status: 429 }) })
    expect((await call(centerDetail, { key: "c-1" })).status).toBe(429)
    expect((await call(prospectDetail, { id: "p-1" })).status).toBe(429)
  })
})
