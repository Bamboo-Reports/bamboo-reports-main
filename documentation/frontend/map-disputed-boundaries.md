# Map Disputed Boundaries (State Choropleth)

This document explains how disputed administrative regions are handled in the state choropleth map and how to configure it.

## Scope

- Component: `components/maps/centers-choropleth-map.tsx`
- Source tiles: MapTiler Countries vector tiles (`source-layer="administrative"`)
- Applies only to the state choropleth view (not city point map)

## Why this exists

MapTiler border styling and map worldview can be controlled at style level, but the choropleth overlay is data-driven and keyed by tile feature properties (`level_0|name`).  
For disputed regions, feature ownership and labels can differ from expected business viewpoint, which can cause:

- Missing fill for disputed polygons
- Duplicate-looking region labels/tooltips
- Internal seam lines between aliased polygons

## Environment flag

Use `NEXT_PUBLIC_MAP_VIEWPOINT_ISO2` in `.env.local`:

```env
NEXT_PUBLIC_MAP_VIEWPOINT_ISO2=IN
```

Current supported mode:

- `IN`: Enables India-specific alias rules for disputed Kashmir-area polygons.

If unset, alias behavior is disabled and raw tile ownership/labels are used.

## Current alias rules (`IN`)

The implementation aliases these feature keys:

- `PK|azad kashmir`
- `PK|azad jammu and kashmir`
- `PK|gilgit-baltistan`
- `PK|gilgit baltistan`

to the aggregate key:

- `IN|jammu and kashmir`

Tooltip display is normalized to:

- State: `Jammu and Kashmir`
- Country: `India`

## Rendering behavior

### Data layer

- Build base aggregates from centers (`count`, distinct accounts, headcount).
- Build render aggregates by applying alias rules for the active viewpoint.
- Feed `match`/`step` expressions from render aggregates.

### Hover grouping

Hover always groups by logical aggregate region key, so hovering either side of the merged disputed area highlights the full merged region consistently.

### Seam suppression

To reduce internal borders between merged polygons:

- Fill outline is forced to the same color as fill (`fill-outline-color` = fill expression).
- Fill anti-aliasing is disabled for base and hover fill layers.
- Outline line layer excludes all merged-region member keys.
- Hover uses a fill layer (not line layer) with transparent outline.

## Known limitation

Aliasing does not physically merge geometries.  
If a line still appears, it is usually from base style boundary layers (MapTiler style), not choropleth overlay layers.

## MapTiler style recommendations

In your MapTiler state style:

1. Duplicate the style.
2. Disable or reduce visibility for disputed/boundary line layers (for example names containing `disputed`, `boundary`, `admin`, `country_border`).
3. Publish and set `NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID` to the new style ID.

## Extending rules

Edit `DISPUTED_ALIAS_RULES_BY_VIEWPOINT` in `components/maps/centers-choropleth-map.tsx`:

- Add new ISO viewpoint keys (for example `US`, `CN`, etc.).
- Add `featureIso2` + `featureStateNames` mappings.
- Set `aggregateIso2` + `aggregateState` target.
- Set normalized tooltip labels via `displayCountry` and `displayState`.

## Verification checklist

1. Set env values in `.env.local`.
2. Restart `npm run dev`.
3. Hard refresh browser (to bypass style/data cache).
4. In state map mode, hover both sides of disputed area and confirm:
   - Same tooltip region identity
   - Same metrics
   - No internal choropleth outline seam from overlay layers
