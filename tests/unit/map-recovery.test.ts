// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import {
  WORKER_PRELOAD_TIMEOUT_MS,
  __resetMapWorkerPreloadForTests,
  isWorkerLoadError,
  preloadMapWorker,
  transformMapRequest,
} from "@/lib/maps/basemap"
import { STABLE_AFTER_LOAD_MS, useMapRecovery } from "@/lib/maps/use-map-recovery"
import { captureEvent } from "@/lib/analytics/client"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
const okFetch = () => vi.fn(() => Promise.resolve(new Response("worker", { status: 200 })))
vi.stubGlobal("fetch", okFetch())

const WORKER_MESSAGE = "Worker failed to load. Check that the worker URL is correct."

const CARTO = "https://tiles.basemaps.cartocdn.com/v/20261026-01/fonts"

describe("transformMapRequest", () => {
  it("serves hosted glyph stacks and ranges from our own origin", () => {
    const stack = "Montserrat Medium,Open Sans Regular,Noto Sans Regular,Noto Sans CJK JP Regular"
    const url = `${CARTO}/${encodeURIComponent(stack)}/0-255.pbf`
    expect(transformMapRequest(url, "Glyphs").url).toBe(
      `${window.location.origin}/map-glyphs/Montserrat%20Medium,Open%20Sans%20Regular,Noto%20Sans%20Regular,Noto%20Sans%20CJK%20JP%20Regular/0-255.pbf`
    )
  })

  it("handles commas left unencoded in the stack", () => {
    const url = `${CARTO}/Open%20Sans%20Bold,Open%20Sans%20Regular/8192-8447.pbf`
    expect(transformMapRequest(url, "Glyphs").url).toBe(
      `${window.location.origin}/map-glyphs/Open%20Sans%20Bold,Open%20Sans%20Regular/8192-8447.pbf`
    )
  })

  it("leaves ranges and stacks we do not host on Carto", () => {
    const cyrillic = `${CARTO}/Open%20Sans%20Bold,Open%20Sans%20Regular/1024-1279.pbf`
    expect(transformMapRequest(cyrillic, "Glyphs").url).toBe(cyrillic)
    const other = `${CARTO}/Roboto%20Regular/0-255.pbf`
    expect(transformMapRequest(other, "Glyphs").url).toBe(other)
  })

  it("never touches non-glyph requests", () => {
    const tile = "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/3/5/3.mvt"
    expect(transformMapRequest(tile, "Tile").url).toBe(tile)
  })
})

describe("useMapRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(captureEvent).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.stubGlobal("fetch", okFetch())
  })

  const setup = () => renderHook(() => useMapRecovery({ map_kind: "state", map_name: "centers_choropleth_map" }))

  it("remounts silently on the first map failure, then shows the error", () => {
    const { result } = setup()
    act(() => result.current.handleFatalError("Failed to fetch style"))
    expect(result.current.error).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.mapKey).toBe(1)
    expect(captureEvent).toHaveBeenCalledWith("map_error_auto_retried", expect.objectContaining({ error_message: "Failed to fetch style" }))

    act(() => result.current.handleFatalError("Failed to fetch style"))
    expect(result.current.error).toBe("Failed to fetch style")
    expect(result.current.errorKind).toBe("map")
    expect(captureEvent).toHaveBeenCalledWith("map_error_shown", expect.objectContaining({ recovery: "map_reload" }))
  })

  it("shows a worker failure at once and offers a page reload", () => {
    const reloadSpy = vi.fn()
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy })
    const { result } = setup()
    act(() => result.current.handleFatalError(WORKER_MESSAGE))
    expect(result.current.errorKind).toBe("worker")
    expect(result.current.error).not.toBeNull()
    expect(result.current.mapKey).toBe(0)
    expect(captureEvent).toHaveBeenCalledWith("map_error_shown", expect.objectContaining({ recovery: "page_reload" }))
    act(() => result.current.reload())
    expect(reloadSpy).toHaveBeenCalled()
  })

  it("recognises the MapLibre worker message", () => {
    expect(isWorkerLoadError(WORKER_MESSAGE)).toBe(true)
    expect(isWorkerLoadError("Failed to fetch style")).toBe(false)
  })

  it("re-arms the silent retry once a load has stayed up", () => {
    const { result } = setup()
    act(() => result.current.handleFatalError("first"))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.handleLoad())
    act(() => vi.advanceTimersByTime(STABLE_AFTER_LOAD_MS))
    act(() => result.current.handleFatalError("later"))
    expect(result.current.error).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.mapKey).toBe(2)
  })

  it("stops remounting when an error always follows a load", () => {
    const { result } = setup()
    act(() => result.current.handleFatalError("broken style"))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.mapKey).toBe(1)
    act(() => result.current.handleLoad())
    act(() => vi.advanceTimersByTime(300))
    act(() => result.current.handleFatalError("broken style"))
    expect(result.current.error).toBe("broken style")
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.mapKey).toBe(1)
    expect(vi.mocked(captureEvent).mock.calls.filter(([e]) => e === "map_error_auto_retried")).toHaveLength(1)
  })

  it("ignores errors that arrive while a retry is pending", () => {
    const { result } = setup()
    act(() => {
      result.current.handleFatalError("a")
      result.current.handleFatalError("b")
    })
    expect(result.current.error).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.mapKey).toBe(1)
  })

  it("reports a worker failure once, however many workers send it", () => {
    const { result } = setup()
    act(() => {
      for (let i = 0; i < 6; i++) result.current.handleFatalError(WORKER_MESSAGE)
    })
    expect(vi.mocked(captureEvent).mock.calls.filter(([e]) => e === "map_error_shown")).toHaveLength(1)
  })

  it("treats a worker error after a load as a map error, not a page reload", () => {
    const { result } = setup()
    act(() => result.current.handleLoad())
    act(() => result.current.handleFatalError(WORKER_MESSAGE))
    expect(result.current.error).toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.mapKey).toBe(1)
    act(() => result.current.handleFatalError(WORKER_MESSAGE))
    expect(result.current.errorKind).toBe("map")
  })

  it("Reload map clears the error and remounts", () => {
    const { result } = setup()
    act(() => result.current.handleFatalError("a"))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.handleFatalError("b"))
    act(() => result.current.reload())
    expect(result.current.error).toBeNull()
    expect(result.current.mapKey).toBe(2)
    expect(captureEvent).toHaveBeenCalledWith("map_reload_clicked", { map_kind: "state", map_name: "centers_choropleth_map", recovery: "map_reload" })
  })
})

describe("preloadMapWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetMapWorkerPreloadForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.stubGlobal("fetch", okFetch())
    __resetMapWorkerPreloadForTests()
  })

  it("gives up on a hung connection instead of waiting forever", async () => {
    const hung = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
    }))
    vi.stubGlobal("fetch", hung)
    let settled = false
    preloadMapWorker().then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(WORKER_PRELOAD_TIMEOUT_MS * 3 + 600 + 1800)
    expect(settled).toBe(true)
    expect(hung).toHaveBeenCalledTimes(3)
  })

  it("retries on the next call after every attempt failed", async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError("network down")))
    vi.stubGlobal("fetch", failing)
    const first = preloadMapWorker()
    await vi.advanceTimersByTimeAsync(600 + 1800)
    await first
    expect(failing).toHaveBeenCalledTimes(3)

    const ok = okFetch()
    vi.stubGlobal("fetch", ok)
    await preloadMapWorker()
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it("keeps a successful preload for the rest of the page", async () => {
    const ok = okFetch()
    vi.stubGlobal("fetch", ok)
    await preloadMapWorker()
    await preloadMapWorker()
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
