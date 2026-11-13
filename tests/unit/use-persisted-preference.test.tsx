// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { BOOLEAN_PREFERENCE, readPreference, usePersistedPreference } from "@/hooks/use-persisted-preference"

const KEY = "test-preference"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe("usePersistedPreference when storage cannot be written", () => {
  it("keeps a choice whose write failed over the older stored value", () => {
    window.localStorage.setItem(KEY, "true")
    const { result } = renderHook(() => usePersistedPreference(KEY, BOOLEAN_PREFERENCE))
    expect(result.current[0]).toBe(true)

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })
    act(() => result.current[1](false))

    expect(window.localStorage.getItem(KEY)).toBe("true")
    expect(result.current[0]).toBe(false)
    expect(readPreference(KEY, BOOLEAN_PREFERENCE)).toBe(false)
  })

  it("reads storage again once a later write succeeds", () => {
    const { result } = renderHook(() => usePersistedPreference(KEY, BOOLEAN_PREFERENCE))
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError")
    })
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)

    setItem.mockRestore()
    act(() => result.current[1](false))
    expect(window.localStorage.getItem(KEY)).toBe("false")
    window.localStorage.setItem(KEY, "true")
    expect(readPreference(KEY, BOOLEAN_PREFERENCE)).toBe(true)
  })
})
