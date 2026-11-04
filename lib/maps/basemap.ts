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
