import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "token-1" } } }) },
  }),
}))

import { ApiClientError, fetchDashboardSummary, isAbortError, REQUEST_TIMEOUT_MS } from "@/lib/dashboard/api-client"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

// A fetch that never answers on its own and, like the real one, rejects with
// the signal's reason once the signal aborts.
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      })
  )
}

describe("api-client request cancellation and timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("aborts the request when the caller's signal aborts", async () => {
    const fetchMock = hangingFetch()
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    const pending = fetchDashboardSummary(createDefaultFilters(), { signal: controller.signal })
    const outcome = pending.catch((err: unknown) => err)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()

    const err = await outcome
    expect(isAbortError(err)).toBe(true)
    expect(err).not.toBeInstanceOf(ApiClientError)
  })

  it("gives up after the timeout with a readable error", async () => {
    vi.stubGlobal("fetch", hangingFetch())

    const outcome = fetchDashboardSummary(createDefaultFilters()).catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

    const err = await outcome
    expect(err).toBeInstanceOf(ApiClientError)
    expect((err as ApiClientError).status).toBe(408)
    expect((err as ApiClientError).message).toBe("The request took too long. Please try again.")
    expect(isAbortError(err)).toBe(false)
  })

  it("waits longer than the routes' 60s limit, so a server 504 arrives first", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(60_000)
  })
})
