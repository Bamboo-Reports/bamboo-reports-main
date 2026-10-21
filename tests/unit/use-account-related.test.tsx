// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useAccountRelated } from "@/hooks/use-account-related"
import { fetchAccountRelated, type AccountRelatedResponse } from "@/lib/dashboard/api-client"

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
    const { result } = renderHook(() => useAccountRelated(""))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ data: null, loading: false, error: false })
  })

  it("loads the related data for a name", async () => {
    fetchMock.mockResolvedValue(RESPONSE)
    const { result } = renderHook(() => useAccountRelated("Acme Corp"))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe(RESPONSE))
    expect(result.current).toMatchObject({ loading: false, error: false })
    expect(fetchMock).toHaveBeenCalledWith("Acme Corp")
  })

  it("stops loading and reports an error when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("500"))
    const { result } = renderHook(() => useAccountRelated("Acme Corp"))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current).toMatchObject({ data: null, loading: false })
  })

  it("retries after a failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce(RESPONSE)
    const { result } = renderHook(() => useAccountRelated("Acme Corp"))
    await waitFor(() => expect(result.current.error).toBe(true))

    act(() => result.current.retry())
    expect(result.current).toMatchObject({ loading: true, error: false })
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
    })

    rerender({ name: "Second" })
    await waitFor(() => expect(result.current.data).toBe(second))
    await act(async () => resolveFirst(RESPONSE))
    expect(result.current.data).toBe(second)
  })
})
