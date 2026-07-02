import { beforeEach, describe, expect, it, vi } from "vitest"

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceRoleClient: () => ({ rpc: rpcMock.rpc }),
}))

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { enforceRateLimit } from "@/lib/rate-limit/server"

describe("enforceRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows a request while under the window budget", async () => {
    rpcMock.rpc.mockResolvedValue({ data: 3, error: null })
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 5 })
    expect(result.ok).toBe(true)
    expect(rpcMock.rpc).toHaveBeenCalledWith(
      "increment_rate_limit",
      expect.objectContaining({ p_user_id: "user-1", p_bucket: "test" })
    )
  })

  it("returns 429 with a Retry-After header once the budget is exceeded", async () => {
    rpcMock.rpc.mockResolvedValue({ data: 6, error: null })
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected rate limit")
    expect(result.response.status).toBe(429)
    const retryAfter = result.response.headers.get("Retry-After")
    expect(retryAfter).toBeTruthy()
    expect(Number(retryAfter)).toBeGreaterThan(0)
  })

  it("fails open when the counter backend returns an error", async () => {
    rpcMock.rpc.mockResolvedValue({ data: null, error: new Error("db down") })
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 1 })
    expect(result.ok).toBe(true)
  })

  it("fails open when the counter backend throws", async () => {
    rpcMock.rpc.mockRejectedValue(new Error("network"))
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 1 })
    expect(result.ok).toBe(true)
  })
})
