import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearCache, getOrCompute } from "@/lib/cache/memory"

const URL_ENV = "UPSTASH_REDIS_REST_URL"
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN"

function redisResponse(result: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ result }),
  } as Response
}

function entryPayload(value: unknown, expiresInMs: number) {
  return JSON.stringify({ value, expires: Date.now() + expiresInMs })
}

describe("Upstash Redis cache layer", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    clearCache()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv(URL_ENV, "https://redis.example.upstash.io")
    vi.stubEnv(TOKEN_ENV, "test-token")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("never touches Redis when the env vars are unset", async () => {
    vi.stubEnv(URL_ENV, "")
    vi.stubEnv(TOKEN_ENV, "")
    const fn = vi.fn(async () => "computed")
    expect(await getOrCompute("k", 1000, fn)).toBe("computed")
    expect(await getOrCompute("k", 1000, fn)).toBe("computed")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("serves a Redis hit without computing and populates the memory L1", async () => {
    fetchMock.mockResolvedValueOnce(redisResponse(entryPayload("from-redis", 60_000)))
    const fn = vi.fn(async () => "computed")
    expect(await getOrCompute("k", 1000, fn)).toBe("from-redis")
    expect(fn).not.toHaveBeenCalled()
    // Second call is an L1 memory hit: no further fetch.
    expect(await getOrCompute("k", 1000, fn)).toBe("from-redis")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://redis.example.upstash.io")
    expect(JSON.parse(init.body)).toEqual(["GET", "dash:k"])
    expect(init.headers.Authorization).toBe("Bearer test-token")
  })

  it("treats an expired Redis payload as a miss", async () => {
    fetchMock
      .mockResolvedValueOnce(redisResponse(entryPayload("stale", -1)))
      .mockResolvedValueOnce(redisResponse("OK"))
    const fn = vi.fn(async () => "fresh")
    expect(await getOrCompute("k", 1000, fn)).toBe("fresh")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("treats malformed Redis JSON as a miss", async () => {
    fetchMock
      .mockResolvedValueOnce(redisResponse("not json {"))
      .mockResolvedValueOnce(redisResponse("OK"))
    const fn = vi.fn(async () => "fresh")
    expect(await getOrCompute("k", 1000, fn)).toBe("fresh")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("writes computed values to Redis with the PX ttl", async () => {
    fetchMock
      .mockResolvedValueOnce(redisResponse(null)) // GET miss
      .mockResolvedValueOnce(redisResponse("OK")) // SET
    const fn = vi.fn(async () => ({ rows: [1, 2] }))
    expect(await getOrCompute("k", 5000, fn)).toEqual({ rows: [1, 2] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const setCommand = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(setCommand[0]).toBe("SET")
    expect(setCommand[1]).toBe("dash:k")
    expect(JSON.parse(setCommand[2]).value).toEqual({ rows: [1, 2] })
    expect(setCommand.slice(3)).toEqual(["PX", 5000])
  })

  it("falls through to computing when Redis errors, and still caches in L1", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))
    const fn = vi.fn(async () => "computed")
    expect(await getOrCompute("k", 1000, fn)).toBe("computed")
    expect(fn).toHaveBeenCalledTimes(1)
    // L1 hit despite Redis being down.
    expect(await getOrCompute("k", 1000, fn)).toBe("computed")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("falls through on a non-OK Redis response", async () => {
    fetchMock.mockResolvedValue(redisResponse(null, false, 500))
    const fn = vi.fn(async () => "computed")
    expect(await getOrCompute("k", 1000, fn)).toBe("computed")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("bypassRead skips the Redis read but still writes both layers", async () => {
    fetchMock.mockResolvedValueOnce(redisResponse("OK")) // SET only
    const fn = vi.fn(async () => "recomputed")
    expect(await getOrCompute("k", 1000, fn, { bypassRead: true })).toBe("recomputed")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0]).toBe("SET")
    // The bypass repopulated L1 for subsequent readers.
    expect(await getOrCompute("k", 1000, fn)).toBe("recomputed")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("shares one Redis lookup between concurrent callers", async () => {
    let resolveGet!: (v: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveGet = r)))
    const fn = vi.fn(async () => "computed")
    const a = getOrCompute("k", 1000, fn)
    const b = getOrCompute("k", 1000, fn)
    resolveGet(redisResponse(entryPayload("from-redis", 60_000)))
    expect(await a).toBe("from-redis")
    expect(await b).toBe("from-redis")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fn).not.toHaveBeenCalled()
  })
})
