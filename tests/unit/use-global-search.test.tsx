// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useGlobalSearch } from "@/hooks/use-global-search"
import { fetchSearch, type SearchResponse } from "@/lib/dashboard/api-client"
import { createQueryWrapper } from "../fixtures/query-client"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))
vi.mock("@/lib/dashboard/api-client", () => ({ fetchSearch: vi.fn() }))

const fetchMock = vi.mocked(fetchSearch)
const empty = { items: [], totalMatches: 0 }
const NO_RESULTS: SearchResponse = { accounts: empty, centers: empty, prospects: empty, total: 0 }

function renderSearch() {
  return renderHook(() => useGlobalSearch({ accounts: [], centers: [], prospects: [], serverMode: true }), {
    wrapper: createQueryWrapper(),
  })
}

async function type(result: ReturnType<typeof renderSearch>["result"], value: string, waitMs: number) {
  await act(async () => {
    result.current.setQuery(value)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(waitMs)
  })
  // The debounced query only starts once React has rendered, and TanStack
  // Query delivers its result on a 0ms timer, so let that timer run too.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe("useGlobalSearch: searching state (#288)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(NO_RESULTS)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("is searching from the keystroke until the results land", async () => {
    const { result } = renderSearch()
    await act(async () => {
      result.current.setQuery("acme")
    })
    expect(result.current.isSearching).toBe(true)

    await type(result, "acme", 300)
    expect(fetchMock).toHaveBeenCalledWith("acme")
    expect(result.current.isSearching).toBe(false)
  })

  it("does not stick on searching when a character is typed and deleted within the debounce", async () => {
    const { result } = renderSearch()
    await type(result, "zzqx", 300)
    expect(result.current.isSearching).toBe(false)

    // Type "a" and delete it again before the debounce fires.
    await type(result, "zzqxa", 100)
    await type(result, "zzqx", 400)

    expect(result.current.query).toBe("zzqx")
    expect(result.current.isSearching).toBe(false)
  })

  it("stops searching when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Request failed (500)"))
    const { result } = renderSearch()
    await type(result, "acme", 300)
    expect(result.current.isSearching).toBe(false)
  })

  it("is not searching for queries shorter than two characters", async () => {
    const { result } = renderSearch()
    await type(result, "a", 300)
    expect(result.current.isSearching).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps the previous results on screen while the next query loads", async () => {
    const acme: SearchResponse = { ...NO_RESULTS, accounts: { items: [{ type: "account", id: "a1", title: "Acme", subtitle: "" }], totalMatches: 1 }, total: 1 }
    let resolveNext: (value: SearchResponse) => void = () => {}
    fetchMock.mockResolvedValueOnce(acme).mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    const { result } = renderSearch()
    await type(result, "acme", 300)
    expect(result.current.results.total).toBe(1)

    await type(result, "acmex", 300)
    expect(result.current.isSearching).toBe(true)
    expect(result.current.results.total).toBe(1)

    await act(async () => resolveNext(NO_RESULTS))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.isSearching).toBe(false)
    expect(result.current.results.total).toBe(0)
  })

  it("shows no results for a short query typed after a search", async () => {
    const acme: SearchResponse = { ...NO_RESULTS, accounts: { items: [{ type: "account", id: "a1", title: "Acme", subtitle: "" }], totalMatches: 1 }, total: 1 }
    fetchMock.mockResolvedValueOnce(acme)
    const { result } = renderSearch()
    await type(result, "acme", 300)
    expect(result.current.results.total).toBe(1)

    await type(result, "a", 300)
    expect(result.current.results.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
