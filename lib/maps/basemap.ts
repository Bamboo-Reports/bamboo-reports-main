import { useTheme } from "next-themes"
import type { MapLibreEvent } from "maplibre-gl"

type MapInstance = MapLibreEvent["target"]
type PaintProperty = Parameters<MapInstance["setPaintProperty"]>[1]

// Carto Positron (light) and Dark Matter (dark): OSM vector basemaps, no API key.
// Only the basemap follows the theme; data layers keep the same colours in both.
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

// Dark Matter's land is near-black (#0e0e0e), darker than the app's own dark
// surfaces. Lift land to charcoal and keep water a shade darker so coastlines
// still read. Data layers are untouched.
const DARK_LAND = "#2a2b2e"
const DARK_WATER = "#1b1f23"
const DARK_BASEMAP_PAINT: Array<[layerId: string, property: PaintProperty, value: string]> = [
  ["background", "background-color", DARK_LAND],
  ["landcover", "fill-color", DARK_LAND],
  ["landuse", "fill-color", DARK_LAND],
  ["park_national_park", "fill-color", DARK_LAND],
  ["park_nature_reserve", "fill-color", DARK_LAND],
  ["water", "fill-color", DARK_WATER],
]

// Softens Dark Matter to charcoal. No-op on other styles, and only sets values
// that differ, so it is safe to call from a styledata handler.
export function softenDarkBasemap(map: MapInstance): void {
  const style = map.getStyle?.()
  if (!style?.name?.startsWith("Dark Matter")) return
  for (const [layerId, property, value] of DARK_BASEMAP_PAINT) {
    if (!map.getLayer(layerId)) continue
    if (map.getPaintProperty(layerId, property) !== value) {
      map.setPaintProperty(layerId, property, value)
    }
  }
}

// Everything the basemap needs after any style (re)load.
export function prepareBasemap(map: MapInstance): void {
  hideBasemapBoundaries(map)
  softenDarkBasemap(map)
}
