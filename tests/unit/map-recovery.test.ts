// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { isWorkerLoadError, transformMapRequest } from "@/lib/maps/basemap"
import { useMapRecovery } from "@/lib/maps/use-map-recovery"
import { captureEvent } from "@/lib/analytics/client"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("worker", { status: 200 }))))

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
    act(() => result.current.handleFatalError("Worker failed to load. Check that the worker URL is correct."))
    expect(result.current.errorKind).toBe("worker")
    expect(result.current.error).not.toBeNull()
    expect(result.current.mapKey).toBe(0)
    expect(captureEvent).toHaveBeenCalledWith("map_error_shown", expect.objectContaining({ recovery: "page_reload" }))
    act(() => result.current.reload())
    expect(reloadSpy).toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("worker", { status: 200 }))))
  })

  it("recognises the MapLibre worker message", () => {
    expect(isWorkerLoadError("Worker failed to load. Check that the worker URL is correct.")).toBe(true)
    expect(isWorkerLoadError("Failed to fetch style")).toBe(false)
  })

  it("re-arms the silent retry after a successful load", () => {
    const { result } = setup()
    act(() => result.current.handleFatalError("first"))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.handleLoad())
    act(() => result.current.handleFatalError("later"))
    expect(result.current.error).toBeNull()
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
