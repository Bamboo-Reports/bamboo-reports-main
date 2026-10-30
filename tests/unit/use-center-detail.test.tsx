// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useCenterDetail } from "@/hooks/use-center-detail"
import { fetchCenterDetail, type CenterDetailResponse } from "@/lib/dashboard/api-client"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/dashboard/api-client", () => ({
  fetchCenterDetail: vi.fn(),
}))

const fetchMock = vi.mocked(fetchCenterDetail)

const RESPONSE = { center: {}, services: [], tech: [] } as unknown as CenterDetailResponse

describe("useCenterDetail", () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("does not fetch and is not loading when the key is empty", () => {
    const { result } = renderHook(() => useCenterDetail(""), { wrapper: createQueryWrapper() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ data: null, loading: false, error: false })
  })

  it("loads the detail for a key", async () => {
    fetchMock.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useCenterDetail("cn-1"), { wrapper: createQueryWrapper() })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe(RESPONSE))
    expect(result.current).toMatchObject({ loading: false, error: false })
    expect(fetchMock).toHaveBeenCalledWith("cn-1")
  })

  it("stops loading and reports an error when the request fails (#287)", async () => {
    fetchMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useCenterDetail("cn-1"), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current).toMatchObject({ data: null, loading: false })
  })

  it("retries after a failure", async () => {
    // Hold the retry open so its loading state can be observed.
    let resolveRetry: (value: CenterDetailResponse) => void = () => {}
    fetchMock
      .mockRejectedValueOnce(new Error("500"))
      .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)))
    const { result } = renderHook(() => useCenterDetail("cn-1"), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBe(true))

    act(() => result.current.retry())
    await waitFor(() => expect(result.current).toMatchObject({ loading: true, error: false }))
    await act(async () => resolveRetry(RESPONSE))
    await waitFor(() => expect(result.current.data).toBe(RESPONSE))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("ignores a late response for a key it has moved away from", async () => {
    let resolveFirst: (value: CenterDetailResponse) => void = () => {}
    const second = { ...RESPONSE } as CenterDetailResponse
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(second)
    const { result, rerender } = renderHook(({ key }) => useCenterDetail(key), {
      initialProps: { key: "cn-1" },
      wrapper: createQueryWrapper(),
    })

    rerender({ key: "cn-2" })
    await waitFor(() => expect(result.current.data).toBe(second))
    await act(async () => resolveFirst(RESPONSE))
    expect(result.current.data).toBe(second)
  })
})
