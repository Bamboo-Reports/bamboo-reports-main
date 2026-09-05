import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearCache, dashboardCacheTtlMs, getOrCompute } from "@/lib/cache/memory"

describe("in-memory dashboard cache", () => {
  beforeEach(() => {
    clearCache()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-03T00:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the cached value within the TTL without recomputing", async () => {
    const fn = vi.fn(async () => "value-1")
    expect(await getOrCompute("k", 1000, fn)).toBe("value-1")
    expect(await getOrCompute("k", 1000, fn)).toBe("value-1")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("recomputes after the TTL expires", async () => {
    let n = 0
    const fn = vi.fn(async () => `value-${++n}`)
    expect(await getOrCompute("k", 1000, fn)).toBe("value-1")
    vi.advanceTimersByTime(1001)
    expect(await getOrCompute("k", 1000, fn)).toBe("value-2")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("shares one in-flight computation between concurrent callers", async () => {
    let resolve!: (v: string) => void
    const fn = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const a = getOrCompute("k", 1000, fn)
    const b = getOrCompute("k", 1000, fn)
    resolve("shared")
    expect(await a).toBe("shared")
    expect(await b).toBe("shared")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("bypassRead recomputes but repopulates the cache", async () => {
    let n = 0
    const fn = vi.fn(async () => `value-${++n}`)
    expect(await getOrCompute("k", 1000, fn)).toBe("value-1")
    expect(await getOrCompute("k", 1000, fn, { bypassRead: true })).toBe("value-2")
    // The bypass wrote the fresh value back for everyone else.
    expect(await getOrCompute("k", 1000, fn)).toBe("value-2")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does not cache failed computations", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("recovered")
    await expect(getOrCompute("k", 1000, fn)).rejects.toThrow("boom")
    expect(await getOrCompute("k", 1000, fn)).toBe("recovered")
  })

  it("ttl 0 disables caching entirely", async () => {
    const fn = vi.fn(async () => "x")
    await getOrCompute("k", 0, fn)
    await getOrCompute("k", 0, fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("evicts the least recently used entries beyond the size cap", async () => {
    const fn = vi.fn(async () => "v")
    for (let i = 0; i < 205; i++) {
      await getOrCompute(`k-${i}`, 60_000, fn)
    }
    // k-0..k-4 were evicted; k-204 is still cached.
    await getOrCompute("k-204", 60_000, fn)
    expect(fn).toHaveBeenCalledTimes(205)
    await getOrCompute("k-0", 60_000, fn)
    expect(fn).toHaveBeenCalledTimes(206)
  })

  it("reads the TTL from the environment with a 10-minute default", () => {
    const prev = process.env.DASHBOARD_CACHE_TTL_MS
    delete process.env.DASHBOARD_CACHE_TTL_MS
    expect(dashboardCacheTtlMs()).toBe(600000)
    process.env.DASHBOARD_CACHE_TTL_MS = "5000"
    expect(dashboardCacheTtlMs()).toBe(5000)
    process.env.DASHBOARD_CACHE_TTL_MS = prev
  })
})
