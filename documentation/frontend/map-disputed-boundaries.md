# Map Boundaries

This document explains how administrative boundaries are rendered in the city and state map views.

## Sources

- Renderer: MapLibre GL through `@vis.gl/react-maplibre`
- Basemap: keyless Carto Positron vector style
- Administrative boundaries: `public/data/admin-1.geojson`
- Components: `components/maps/centers-map.tsx` and `components/maps/centers-choropleth-map.tsx`

No map API key or map-specific environment variable is required.

## Rendering behavior

The Carto basemap includes OpenStreetMap boundary layers. After each map loads, `hideBasemapBoundaries` hides layers whose source layer is `boundary`. This prevents the basemap's de-facto international borders from competing with the application boundary overlay.

Both map views then load `/data/admin-1.geojson`:

- The city view draws the administrative outlines beneath its center markers.
- The choropleth view uses the polygons for state fills, hover behavior, outlines, and tooltips.

The choropleth matches center data to features using normalized `center_country_iso2` and `center_state` values.

## Troubleshooting

If the basemap does not load, inspect browser requests to `basemaps.cartocdn.com`.

If administrative polygons do not load, confirm `public/data/admin-1.geojson` exists and is served at `/data/admin-1.geojson`.

If conflicting borders appear, confirm `hideBasemapBoundaries` runs from each map's load handler and that the Carto style still identifies its border layers with `source-layer: boundary`.
