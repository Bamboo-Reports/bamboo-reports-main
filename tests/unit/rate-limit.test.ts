import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

describe("enforceRateLimit with Upstash Redis configured", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const pipelineResponse = (results: unknown[]) =>
    ({ ok: true, status: 200, json: async () => results.map((result) => ({ result })) }) as Response

  it("counts in Redis with one pipelined INCR + PEXPIRE and never calls Supabase", async () => {
    fetchMock.mockResolvedValueOnce(pipelineResponse([3, 1]))
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 5, windowMs: 60_000 })
    expect(result.ok).toBe(true)
    expect(rpcMock.rpc).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://redis.example.upstash.io/pipeline")
    const commands = JSON.parse(init.body) as (string | number)[][]
    expect(commands).toHaveLength(2)
    expect(commands[0][0]).toBe("INCR")
    expect(commands[0][1]).toMatch(/^rl:user-1:test:\d+$/)
    expect(commands[1]).toEqual(["PEXPIRE", commands[0][1], 61_000])
  })

  it("returns 429 once the Redis counter exceeds the budget", async () => {
    fetchMock.mockResolvedValueOnce(pipelineResponse([6, 1]))
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected rate limit")
    expect(result.response.status).toBe(429)
  })

  it("fails open when Redis is unreachable, without falling back to Supabase", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"))
    const result = await enforceRateLimit({ userId: "user-1", bucket: "test", maxPerWindow: 1 })
    expect(result.ok).toBe(true)
    expect(rpcMock.rpc).not.toHaveBeenCalled()
  })
})
