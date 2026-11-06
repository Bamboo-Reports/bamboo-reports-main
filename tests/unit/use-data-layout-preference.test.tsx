// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { DATA_LAYOUT_STORAGE_KEY, useDataLayoutPreference } from "@/hooks/use-data-layout-preference"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("useDataLayoutPreference", () => {
  it("defaults to the table", () => {
    const { result } = renderHook(() => useDataLayoutPreference())
    expect(result.current[0]).toBe("table")
  })

  it("restores a saved layout", () => {
    window.localStorage.setItem(DATA_LAYOUT_STORAGE_KEY, "grid")
    const { result } = renderHook(() => useDataLayoutPreference())
    expect(result.current[0]).toBe("grid")
  })

  it("ignores an unknown stored value", () => {
    window.localStorage.setItem(DATA_LAYOUT_STORAGE_KEY, "cards")
    const { result } = renderHook(() => useDataLayoutPreference())
    expect(result.current[0]).toBe("table")
  })

  it("saves the choice and updates every tab using it", () => {
    const accounts = renderHook(() => useDataLayoutPreference())
    const centres = renderHook(() => useDataLayoutPreference())

    act(() => accounts.result.current[1]("grid"))

    expect(window.localStorage.getItem(DATA_LAYOUT_STORAGE_KEY)).toBe("grid")
    expect(accounts.result.current[0]).toBe("grid")
    expect(centres.result.current[0]).toBe("grid")
  })
})
