import type { MapLibreEvent } from "maplibre-gl"

type MapInstance = MapLibreEvent["target"]

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
