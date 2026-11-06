import { useTheme } from "next-themes"
import type { MapLibreEvent } from "maplibre-gl"

type MapInstance = MapLibreEvent["target"]
type PaintProperty = Parameters<MapInstance["setPaintProperty"]>[1]

// Carto Positron (light) and Dark Matter (dark): OSM vector basemaps, no API key.
// Only the basemap follows the theme (see themeBasemap); data layers keep the same colours in both.
// India boundaries come from the Survey of India GeoJSON overlay, not the basemap
// (see hideBasemapBoundaries).
export const BASEMAP_STYLE_URLS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const

export function useBasemapStyleUrl(): string {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === "dark" ? BASEMAP_STYLE_URLS.dark : BASEMAP_STYLE_URLS.light
}

// maplibre-gl 6 builds its worker path from import.meta.url at runtime, which the
// bundler can't see, so production 404s on it ("Worker failed to load"). This
// literal new URL() lets Turbopack emit the worker file and rewrite the path.
export const MAPLIBRE_WORKER_URL = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString()

// MapLibre starts its workers once per page and keeps them for every later
// map, so a worker that fails to download stays broken until a full reload.
// Fetch the worker file ourselves first, retrying through brief network drops:
// the response is immutable, so the browser caches it and MapLibre then starts
// its workers from the cache. Resolves either way, and each attempt is cut off
// after WORKER_PRELOAD_TIMEOUT_MS, so a hung connection cannot hold the map on
// its loading state. If every attempt fails, the next map mount tries again.
const WORKER_PRELOAD_DELAYS_MS = [0, 600, 1800]
export const WORKER_PRELOAD_TIMEOUT_MS = 8000
let workerPreload: Promise<void> | null = null

export function preloadMapWorker(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  workerPreload ??= (async () => {
    for (const delay of WORKER_PRELOAD_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), WORKER_PRELOAD_TIMEOUT_MS)
      try {
        const res = await fetch(MAPLIBRE_WORKER_URL, { cache: "force-cache", signal: controller.signal })
        if (res.ok) {
          await res.arrayBuffer()
          return
        }
      } catch {
        // Network error or timeout: try again after the next delay.
      } finally {
        clearTimeout(timeout)
      }
    }
    // Every attempt failed: forget this run so a later mount retries.
    workerPreload = null
  })()
  return workerPreload
}

export function __resetMapWorkerPreloadForTests(): void {
  workerPreload = null
}

/** True when the map failed because its worker could not start. */
export const isWorkerLoadError = (message: string) => /worker failed to load/i.test(message)

// Map label fonts ("glyphs") we serve ourselves from public/map-glyphs, so
// labels do not depend on Carto's font server, which some client networks
// block or drop. Only Latin ranges are hosted: basic Latin, accented letters,
// combining marks and general punctuation. Any other request still goes to
// Carto, and if that fails MapLibre draws the character with a local font.
// To refresh, re-download the same stacks and ranges from the glyphs URL in
// the Carto style.json and store them decompressed: Carto sends them gzipped,
// and we serve them without a Content-Encoding header, so a gzipped file
// fails to parse ("Unimplemented type: 7"). tests/unit/map-glyphs.test.ts
// checks this.
const HOSTED_GLYPH_STACKS = new Set([
  "Montserrat Medium,Open Sans Regular,Noto Sans Regular,Noto Sans CJK JP Regular",
  "Montserrat Regular Italic,Open Sans Italic,Noto Sans Regular,Noto Sans CJK JP Regular",
  "Montserrat SemiBold Italic,Open Sans Italic,Noto Sans Regular,Noto Sans CJK JP Regular",
  "Montserrat SemiBold,Open Sans Bold,Noto Sans Regular,Noto Sans CJK JP Regular",
  // Our own city bubble labels (components/maps/centers-map.tsx).
  "Open Sans Bold,Open Sans Regular",
])
const HOSTED_GLYPH_RANGES = new Set(["0-255", "256-511", "512-767", "768-1023", "8192-8447"])
const GLYPH_URL_PATTERN = /\/fonts\/([^/]+)\/(\d+-\d+)\.pbf(?:[?#].*)?$/

/** MapLibre transformRequest: points hosted glyph requests at our own server. */
export function transformMapRequest(url: string, resourceType?: string): { url: string } {
  if (resourceType !== "Glyphs" || typeof window === "undefined") return { url }
  const match = url.match(GLYPH_URL_PATTERN)
  if (!match) return { url }
  let stack: string
  try {
    stack = decodeURIComponent(match[1])
  } catch {
    return { url }
  }
  if (!HOSTED_GLYPH_STACKS.has(stack) || !HOSTED_GLYPH_RANGES.has(match[2])) return { url }
  const path = stack.split(",").map(encodeURIComponent).join(",")
  return { url: `${window.location.origin}/map-glyphs/${path}/${match[2]}.pbf` }
}

// Carto basemaps draw OSM de-facto international borders (dotted Kashmir, Aksai
// Chin as China, etc.) from the "boundary" source-layer. Hide those so only our
// Survey of India GeoJSON overlay draws boundaries. Safe no-op on other styles.
// Call it on every style change (theme switch), not just on load: a new style
// brings its boundary layers back. Only touches layers that are still visible,
// so calling it from a styledata handler does not loop.
export function hideBasemapBoundaries(map: MapInstance): void {
  const style = map.getStyle?.()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if (
      (layer as { "source-layer"?: string })["source-layer"] === "boundary" &&
      map.getLayoutProperty(layer.id, "visibility") !== "none"
    ) {
      map.setLayoutProperty(layer.id, "visibility", "none")
    }
  }
}

// Both Carto styles are repainted onto the app's own neutrals so the map sits
// in the dashboard like any other surface: land matches the page background,
// water is one step darker (light) or deeper (dark), and the green and beige
// land-use patches are cleared so only the data layers carry colour.
// Light values follow --background and --muted, dark values the neutral greys
// of the dark theme. Data layers are untouched.
const CLEAR = "rgba(0, 0, 0, 0)"
const basemapPaint = (land: string, water: string): Array<[layerId: string, property: PaintProperty, value: string]> => [
  ["background", "background-color", land],
  ["landcover", "fill-color", CLEAR],
  ["landuse", "fill-color", CLEAR],
  ["landuse_residential", "fill-color", CLEAR],
  ["park_national_park", "fill-color", CLEAR],
  ["park_nature_reserve", "fill-color", CLEAR],
  ["water", "fill-color", water],
  ["waterway", "line-color", water],
  ["watername_ocean", "text-halo-color", water],
  ["watername_sea", "text-halo-color", water],
]

const BASEMAP_PAINT = {
  light: basemapPaint("#f8fafc", "#e2e8ef"),
  dark: basemapPaint("#262626", "#181818"),
}

// Repaints Positron or Dark Matter to the app theme. No-op on other styles,
// and only sets values that differ, so it is safe to call from a styledata
// handler.
export function themeBasemap(map: MapInstance): void {
  const name = map.getStyle?.()?.name ?? ""
  const paint = name.startsWith("Dark Matter") ? BASEMAP_PAINT.dark : name.startsWith("Positron") ? BASEMAP_PAINT.light : null
  if (!paint) return
  for (const [layerId, property, value] of paint) {
    if (!map.getLayer(layerId)) continue
    if (map.getPaintProperty(layerId, property) !== value) {
      map.setPaintProperty(layerId, property, value)
    }
  }
}

// Everything the basemap needs after any style (re)load.
export function prepareBasemap(map: MapInstance): void {
  hideBasemapBoundaries(map)
  themeBasemap(map)
}
