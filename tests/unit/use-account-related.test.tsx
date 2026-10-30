// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useAccountRelated } from "@/hooks/use-account-related"
import { fetchAccountRelated, type AccountRelatedResponse } from "@/lib/dashboard/api-client"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/dashboard/api-client", () => ({
  fetchAccountRelated: vi.fn(),
}))

const fetchMock = vi.mocked(fetchAccountRelated)

const RESPONSE = { centers: [], prospects: [], services: [], tech: [] } as unknown as AccountRelatedResponse

describe("useAccountRelated", () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("does not fetch and is not loading when the name is empty", () => {
    const { result } = renderHook(() => useAccountRelated(""), { wrapper: createQueryWrapper() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ data: null, loading: false, error: false })
  })

  it("loads the related data for a name", async () => {
    fetchMock.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useAccountRelated("Acme Corp"), { wrapper: createQueryWrapper() })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe(RESPONSE))
    expect(result.current).toMatchObject({ loading: false, error: false })
    expect(fetchMock).toHaveBeenCalledWith("Acme Corp")
  })

  it("shares one request and cached response between callers of the same account", async () => {
    fetchMock.mockResolvedValue(RESPONSE)
    const wrapper = createQueryWrapper()
    const first = renderHook(() => useAccountRelated("Acme Corp"), { wrapper })
    const second = renderHook(() => useAccountRelated("Acme Corp"), { wrapper })
    await waitFor(() => expect(first.result.current.data).toBe(RESPONSE))
    await waitFor(() => expect(second.result.current.data).toBe(RESPONSE))

    // A dialog reopened later is served from the cache.
    const reopened = renderHook(() => useAccountRelated("Acme Corp"), { wrapper })
    expect(reopened.result.current).toMatchObject({ data: RESPONSE, loading: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("stops loading and reports an error when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useAccountRelated("Acme Corp"), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current).toMatchObject({ data: null, loading: false })
  })

  it("retries after a failure", async () => {
    // Hold the retry open so its loading state can be observed.
    let resolveRetry: (value: AccountRelatedResponse) => void = () => {}
    fetchMock
      .mockRejectedValueOnce(new Error("500"))
      .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)))
    const { result } = renderHook(() => useAccountRelated("Acme Corp"), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBe(true))

    act(() => result.current.retry())
    await waitFor(() => expect(result.current).toMatchObject({ loading: true, error: false }))
    await act(async () => resolveRetry(RESPONSE))
    await waitFor(() => expect(result.current.data).toBe(RESPONSE))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("ignores a late response for a name it has moved away from", async () => {
    let resolveFirst: (value: AccountRelatedResponse) => void = () => {}
    const second = { ...RESPONSE } as AccountRelatedResponse
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(second)
    const { result, rerender } = renderHook(({ name }) => useAccountRelated(name), {
      initialProps: { name: "First" },
      wrapper: createQueryWrapper(),
    })

    rerender({ name: "Second" })
    await waitFor(() => expect(result.current.data).toBe(second))
    await act(async () => resolveFirst(RESPONSE))
    expect(result.current.data).toBe(second)
  })
})
