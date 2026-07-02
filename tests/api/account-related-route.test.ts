import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  extractBearerToken: vi.fn((h: string | null) => (h === "Bearer token-1" ? "token-1" : null)),
  resolveAuthenticatedUserId: vi.fn(async () => "user-1"),
}))
const rateLimitMocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }))
const warehouseMocks = vi.hoisted(() => ({ queryWarehouse: vi.fn() }))
const accessMocks = vi.hoisted(() => ({
  isSectionEnabled: vi.fn(() => true),
  getProspectsPerAccountLimit: vi.fn((): number | null => null),
}))

vi.mock("@/lib/auth/server", () => authMocks)
vi.mock("@/lib/rate-limit/server", () => rateLimitMocks)
vi.mock("@/lib/db/warehouse", () => warehouseMocks)
vi.mock("@/lib/config/dashboard-access", () => accessMocks)
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { GET as accountRelated } from "@/app/api/accounts/[name]/related/route"

const ACCOUNT = { account_global_legal_name: "Acme Corp", account_hq_country: "United States" }
const CENTER = { cn_unique_key: "c-1", account_global_legal_name: "Acme Corp", center_name: "Acme GCC" }
const SERVICE = { cn_unique_key: "c-1", center_name: "Acme GCC", primary_service: "IT" }
const TECH = { account_global_legal_name: "Acme Corp", cn_unique_key: "c-1", software_in_use: "SAP" }
const PROSPECTS = [
  { ps_unique_key: "p-1", account_global_legal_name: "Acme Corp", prospect_department: "IT", prospect_level: "VP", prospect_city: "Austin", prospect_state: "TX", prospect_country: "US", head_type: null },
  { ps_unique_key: "p-2", account_global_legal_name: "Acme Corp", prospect_department: "HR", prospect_level: "Dir", prospect_city: "Austin", prospect_state: "TX", prospect_country: "US", head_type: null },
]

// Dispatch on distinguishing fragments; note the services query embeds a
// "from centers" subquery, so it must be matched before centers.
function mockWarehouse(overrides: Partial<Record<"accounts" | "centers" | "services" | "tech" | "prospects", unknown[]>> = {}) {
  warehouseMocks.queryWarehouse.mockImplementation(async (q: { text: string; values: unknown[] }) => {
    if (q.text.includes("from services")) return overrides.services ?? [SERVICE]
    if (q.text.includes("from prospects")) return overrides.prospects ?? PROSPECTS
    if (q.text.includes("from tech")) return overrides.tech ?? [TECH]
    if (q.text.includes("from centers")) return overrides.centers ?? [CENTER]
    if (q.text.includes("from accounts")) return overrides.accounts ?? [ACCOUNT]
    return []
  })
}

const get = (name: string, auth = true) =>
  accountRelated(
    new Request(`https://x/api/accounts/${name}/related`, {
      headers: auth ? { authorization: "Bearer token-1" } : {},
    }),
    { params: Promise.resolve({ name }) }
  )

describe("GET /api/accounts/[name]/related", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.extractBearerToken.mockImplementation((h: string | null) => (h === "Bearer token-1" ? "token-1" : null))
    authMocks.resolveAuthenticatedUserId.mockResolvedValue("user-1")
    rateLimitMocks.enforceRateLimit.mockResolvedValue({ ok: true })
    accessMocks.isSectionEnabled.mockReturnValue(true)
    accessMocks.getProspectsPerAccountLimit.mockReturnValue(null)
    mockWarehouse()
  })

  it("rejects without a token", async () => {
    const res = await get("Acme%20Corp", false)
    expect(res.status).toBe(401)
    expect(warehouseMocks.queryWarehouse).not.toHaveBeenCalled()
  })

  it("propagates the rate limit 429", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 429 }) })
    const res = await get("Acme%20Corp")
    expect(res.status).toBe(429)
  })

  it("returns the full related payload and decodes the name", async () => {
    const res = await get("Acme%20%26%20Co")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      account: ACCOUNT,
      centers: [CENTER],
      services: [SERVICE],
      tech: [TECH],
      prospects: PROSPECTS,
      lockedProspectTeasers: [],
    })
    for (const call of warehouseMocks.queryWarehouse.mock.calls) {
      expect((call[0] as { values: unknown[] }).values).toEqual(["Acme & Co"])
    }
  })

  it("partitions prospects into teasers when a per-account limit applies", async () => {
    accessMocks.getProspectsPerAccountLimit.mockReturnValue(1)
    const res = await get("Acme%20Corp")
    const body = (await res.json()) as { prospects: unknown[]; lockedProspectTeasers: Array<{ locked: boolean }> }
    expect(body.prospects).toEqual([PROSPECTS[0]])
    expect(body.lockedProspectTeasers).toHaveLength(1)
    expect(body.lockedProspectTeasers[0].locked).toBe(true)
  })

  it("returns 404 for an unknown account", async () => {
    mockWarehouse({ accounts: [], centers: [], services: [], tech: [], prospects: [] })
    const res = await get("Nope")
    expect(res.status).toBe(404)
  })

  it("returns 400 for a blank name", async () => {
    const res = await get("%20")
    expect(res.status).toBe(400)
  })

  it("honors section entitlements", async () => {
    accessMocks.isSectionEnabled.mockImplementation(((section: string) => section === "accounts") as never)
    const res = await get("Acme%20Corp")
    const body = (await res.json()) as Record<string, unknown[]>
    expect(body.account).toEqual(ACCOUNT)
    expect(body.centers).toEqual([])
    expect(body.services).toEqual([])
    expect(body.prospects).toEqual([])
    expect(body.lockedProspectTeasers).toEqual([])
  })
})
