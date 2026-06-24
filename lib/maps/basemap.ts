import type { MapLibreEvent } from "maplibre-gl"

type MapInstance = MapLibreEvent["target"]

// Carto Positron: light OSM vector basemap, no API key. India boundaries come from
// the Survey of India GeoJSON overlay, not the basemap (see hideBasemapBoundaries).
export const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

// Carto basemaps draw OSM de-facto international borders (dotted Kashmir, Aksai
// Chin as China, etc.) from the "boundary" source-layer. Hide those so only our
// Survey of India GeoJSON overlay draws boundaries. Safe no-op on other styles.
export function hideBasemapBoundaries(map: MapInstance): void {
  const style = map.getStyle?.()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if ((layer as { "source-layer"?: string })["source-layer"] === "boundary") {
      map.setLayoutProperty(layer.id, "visibility", "none")
    }
  }
}
