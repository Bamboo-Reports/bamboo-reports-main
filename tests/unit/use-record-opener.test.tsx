// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

const toastMocks = vi.hoisted(() => ({ loading: vi.fn(), info: vi.fn(), dismiss: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMocks }))

import { RECORD_OPEN_TOAST_ID, useRecordOpener } from "@/hooks/use-record-opener"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const messages = { label: "account", notFoundMessage: "This account could not be found.", errorMessage: "This account is not available right now." }

describe("useRecordOpener (#290)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("shows a loading toast for a slow record, then opens it", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const load = deferred<string | null>()
    const onLoaded = vi.fn()

    act(() => result.current({ ...messages, load: () => load.promise, onLoaded }))
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(toastMocks.loading).toHaveBeenCalledWith("Opening account…", { id: RECORD_OPEN_TOAST_ID })

    await act(async () => load.resolve("Acme"))
    expect(onLoaded).toHaveBeenCalledWith("Acme")
    expect(toastMocks.dismiss).toHaveBeenCalledWith(RECORD_OPEN_TOAST_ID)
  })

  it("does not flash a loading toast for a record that loads quickly", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const onLoaded = vi.fn()

    await act(async () => {
      result.current({ ...messages, load: async () => "Acme", onLoaded })
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(onLoaded).toHaveBeenCalledWith("Acme")
    expect(toastMocks.loading).not.toHaveBeenCalled()
  })

  it("says so when the record is missing instead of doing nothing", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const onLoaded = vi.fn()

    await act(async () => {
      result.current({ ...messages, load: async () => null, onLoaded })
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(toastMocks.info).toHaveBeenCalledWith("This account could not be found.", { id: RECORD_OPEN_TOAST_ID })
  })

  it("reports a failed request", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const onLoaded = vi.fn()

    await act(async () => {
      result.current({ ...messages, load: () => Promise.reject(new Error("500")), onLoaded })
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(toastMocks.info).toHaveBeenCalledWith("This account is not available right now.", { id: RECORD_OPEN_TOAST_ID })
  })

  it("opens only the last record clicked, whichever answers first", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const first = deferred<string | null>()
    const second = deferred<string | null>()
    const onLoaded = vi.fn()

    act(() => result.current({ ...messages, load: () => first.promise, onLoaded }))
    act(() => result.current({ ...messages, load: () => second.promise, onLoaded }))
    await act(async () => second.resolve("Second"))
    await act(async () => first.resolve("First"))

    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledWith("Second")
  })

  it("ignores a superseded request that fails", async () => {
    const { result } = renderHook(() => useRecordOpener())
    const first = deferred<string | null>()
    const onLoaded = vi.fn()

    act(() => result.current({ ...messages, load: () => first.promise, onLoaded }))
    await act(async () => {
      result.current({ ...messages, load: async () => "Second", onLoaded })
    })
    await act(async () => first.reject(new Error("500")))

    expect(onLoaded).toHaveBeenCalledWith("Second")
    expect(toastMocks.info).not.toHaveBeenCalled()
  })
})
