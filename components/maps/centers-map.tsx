"use client"

import { ChartTooltipCard } from "@/components/ui/chart-tooltip-card"
import { MapControls } from "@/components/maps/map-controls"
import { DONUT_CHART_COLORS } from "@/lib/utils/chart-helpers"
import { bubbleRadius } from "@/lib/maps/bubble-size"
import { knownText } from "@/lib/utils/helpers"
import React, { useMemo, useState, useEffect, useCallback, useLayoutEffect } from "react"
import { Map as MapGL, Source, Layer, type MapRef, type ViewStateChangeEvent } from "@vis.gl/react-maplibre"
import type { ExpressionSpecification } from "maplibre-gl"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { MAPLIBRE_WORKER_URL, prepareBasemap, transformMapRequest, useBasemapStyleUrl } from "@/lib/maps/basemap"
import { useMapRecovery } from "@/lib/maps/use-map-recovery"
import { MapErrorState } from "@/components/maps/map-error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DebugLocationSearch } from "@/components/maps/debug-location-search"
import { createLogger } from "@/lib/logger"
import type { Center } from "@/lib/types"
import type { CityAggregate } from "@/lib/dashboard/api-client"
import "maplibre-gl/dist/maplibre-gl.css"
import { countsTowardHeadcount } from "@/lib/dashboard/headcount"
import { INDIA_MAP_VIEW, type MapCamera } from "@/components/maps/map-camera"

interface CentersMapProps {
  centers: Center[]
  /** Server mode (#249): pre-aggregated city data replaces the client computation over `centers`. */
  cities?: CityAggregate[] | null
  heightClass?: string
  showAccountsCount?: boolean
  /** Camera to open on, kept by the parent so it survives a City/State switch. */
  viewState?: MapCamera
  onViewStateChange?: (view: MapCamera) => void
}

interface CityCluster {
  city: string
  country: string
  lat: number
  lng: number
  count: number
  accountsCount: number
  headcount: number
}

interface CityFeatureProperties {
  city: string
  country: string
  count: number
  accountsCount: number
  headcount: number
  radius: number
  label: string
  labelSize: number
  showLabel: boolean
}

interface CityFeature {
  type: "Feature"
  properties: CityFeatureProperties
  geometry: {
    type: "Point"
    coordinates: [number, number]
  }
}

interface CityFeatureCollection {
  type: "FeatureCollection"
  features: CityFeature[]
}

// A thin ring just outside each bubble; kept tight so it does not make the
// bubble read larger than its count.
const HALO_RADIUS_SCALE = 1.15
// Cities with at least this many centres always show, even when crowded.
const HOTSPOT_MIN_COUNT = 100
const logger = createLogger("components/CentersMap")

export function CentersMap({
  centers,
  cities,
  heightClass = "h-[750px]",
  showAccountsCount = true,
  viewState,
  onViewStateChange,
}: CentersMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  // Data problems (bad city aggregates) and map failures are handled separately:
  // only the map gets the silent retry and Reload map button.
  const [dataError, setDataError] = useState<string | null>(null)
  const { mapKey, ready, error, errorKind, handleFatalError, handleLoad, reload } = useMapRecovery({
    map_kind: "city",
    map_name: "centers_map",
  })
  const [isClient, setIsClient] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [visibleGeojsonData, setVisibleGeojsonData] = useState<CityFeatureCollection | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const mapRef = React.useRef<MapRef>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const tooltipRef = React.useRef<HTMLDivElement | null>(null)
  const lastMapMoveTrackedAtRef = React.useRef(0)
  const lastZoomTrackedRef = React.useRef<number | null>(null)
  const lastTooltipCityRef = React.useRef<string | null>(null)

  useEffect(() => {
    setIsClient(true)
    logger.debug("mounted", {
      centers_count: centers?.length,
    })
  }, [centers])

  useLayoutEffect(() => {
    if (!mousePosition || !containerRef.current || !tooltipRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const margin = 8
    const offset = 15

    let x = mousePosition.x + offset
    let y = mousePosition.y + offset

    if (x + tooltipRect.width + margin > containerRect.width) {
      x = mousePosition.x - tooltipRect.width - offset
    }
    if (x < margin) {
      x = margin
    }

    if (y + tooltipRect.height + margin > containerRect.height) {
      y = mousePosition.y - tooltipRect.height - offset
    }
    if (y < margin) {
      y = margin
    }

    setTooltipPosition({ x, y })
  }, [mousePosition, hoveredCity])

  // Aggregate centers by city and calculate cluster data. In server mode the
  // aggregation arrives pre-computed via the `cities` prop.
  const cityData = useMemo<CityCluster[]>(() => {
    if (cities) {
      return cities.map((c) => ({
        city: c.city,
        country: c.country ?? "",
        lat: c.lat,
        lng: c.lng,
        count: c.count,
        accountsCount: c.accountsCount,
        headcount: c.headcount,
      }))
    }
    try {
      logger.debug("city_data_calculation_started", { centers_count: centers.length })
      const cityMap = new Map<string, CityCluster & { accounts: Set<string> }>()

      centers.forEach((center) => {
        // A blank or "TBA" city has only a stand-in point, so it is left off the map.
        const city = knownText(center.center_city)
        const country = center.center_country
        const account = center.account_global_legal_name
        // Same rule as the Headcount card: some centre types are left out.
        const employees = countsTowardHeadcount(center.center_type) ? (center.center_employees ?? 0) : 0
        const lat = center.lat
        const lng = center.lng

        // Skip if no coordinates or city
        if (lat === null || lat === undefined || lng === null || lng === undefined || isNaN(lat) || isNaN(lng)) {
          return
        }
        if (!city) return

        const existing = cityMap.get(city)
        if (existing) {
          existing.accounts.add(account)
          existing.count += 1
          existing.headcount += employees
          existing.accountsCount = existing.accounts.size
        } else {
          const accounts = new Set<string>()
          accounts.add(account)
          cityMap.set(city, {
            city,
            country: country ?? "",
            lat,
            lng,
            count: 1,
            accounts,
            accountsCount: 1,
            headcount: employees,
          })
        }
      })

      const result = Array.from(cityMap.values()).map(({ accounts: _accounts, ...cluster }) => cluster)
      logger.debug("city_data_calculated", { cities_count: result.length })
      return result
    } catch (err) {
      logger.error("city_data_calculation_failed", { error: err })
      setDataError(err instanceof Error ? err.message : "Error calculating city data")
      return []
    }
  }, [cities, centers])

  useEffect(() => {
    if (!hoveredCity) {
      lastTooltipCityRef.current = null
      return
    }

    if (lastTooltipCityRef.current === hoveredCity) {
      return
    }

    const cityInfo = cityData.find((c) => c.city === hoveredCity)
    if (!cityInfo) return
    captureEvent(ANALYTICS_EVENTS.MAP_TOOLTIP_VIEWED, {
      map_kind: "city",
      map_name: "centers_map",
      city: hoveredCity,
      country: cityInfo.country || null,
      center_count: cityInfo.count,
      accounts_count: cityInfo.accountsCount,
      headcount: cityInfo.headcount,
    })
    lastTooltipCityRef.current = hoveredCity
  }, [hoveredCity, cityData])

  // Fallback to ensure the map shows even if onLoad is delayed
  useEffect(() => {
    const fallback = setTimeout(() => setIsMapReady(true), 700)
    return () => clearTimeout(fallback)
  }, [])

  // Log sizing from a minimum that fits a number (see bubbleRadius); the largest
  // city in view gets the largest bubble.
  const maxCityCount = useMemo(() => Math.max(1, ...cityData.map((c) => c.count)), [cityData])
  const getCoreRadiusForCount = useCallback(
    (count: number) => bubbleRadius(count, maxCityCount),
    [maxCityCount]
  )
  // Reference sizes for the legend: round counts up to the largest city in view.
  const sizeLegend = useMemo(
    () =>
      [1, 10, 100, 1000]
        .filter((count) => count <= maxCityCount)
        .map((count) => ({ count, radius: bubbleRadius(count, maxCityCount) })),
    [maxCityCount]
  )

  const getLabelConfig = useCallback((count: number, radius: number) => {
    const label = count.toString()
    const minFontSize = 8
    const maxFontSize = 12
    const targetFontSize = Math.min(maxFontSize, Math.max(minFontSize, radius * 1.1))
    const approxCharWidth = 0.6
    const padding = 2
    const maxTextWidth = radius * 2 - padding * 2
    const textWidth = label.length * targetFontSize * approxCharWidth
    const showLabel = textWidth <= maxTextWidth && targetFontSize <= radius * 2 - padding

    return {
      label,
      labelSize: targetFontSize,
      showLabel,
    }
  }, [])

  // Convert city data to GeoJSON
  // Sort by count descending so larger circles render first (at bottom)
  const geojsonData = useMemo<CityFeatureCollection>(() => {
    const sortedCities = [...cityData].sort((a, b) => b.count - a.count)
    return {
      type: "FeatureCollection" as const,
      features: sortedCities.map((city) => {
        const radius = getCoreRadiusForCount(city.count)
        return {
          type: "Feature" as const,
          properties: {
            city: city.city,
            country: city.country,
            count: city.count,
            accountsCount: city.accountsCount,
            headcount: city.headcount,
            radius,
            ...getLabelConfig(city.count, radius),
          },
          geometry: {
            type: "Point" as const,
            coordinates: [city.lng, city.lat] as [number, number],
          },
        }
      }),
    }
  }, [cityData, getCoreRadiusForCount, getLabelConfig])

  const updateVisibleGeojsonData = useCallback(() => {
    const mapInstance = mapRef.current?.getMap()
    if (!mapInstance?.project || geojsonData.features.length === 0) {
      setVisibleGeojsonData(geojsonData)
      return
    }

    // Keeps the map readable: a smaller city whose bubble (with its halo) would
    // touch one already placed is left out at this zoom and appears on zooming
    // in. Bubbles are placed largest first. Hotspots (HOTSPOT_MIN_COUNT or
    // more centres) are never left out, so neighbours like Mumbai and Pune or
    // Delhi, Noida and Gurugram all show; their numbers give way to the bigger
    // city's where they would collide.
    const keptFeatures: CityFeature[] = []
    const keptCenters: Array<{ x: number; y: number; radius: number }> = []

    for (const feature of geojsonData.features) {
      const [lng, lat] = feature.geometry.coordinates
      const projected = mapInstance.project([lng, lat])
      const haloRadius = getCoreRadiusForCount(feature.properties.count) * HALO_RADIUS_SCALE

      const overlaps = keptCenters.some((kept) => {
        const dx = projected.x - kept.x
        const dy = projected.y - kept.y
        const minDistance = haloRadius + kept.radius
        return dx * dx + dy * dy < minDistance * minDistance
      })

      if (!overlaps || feature.properties.count >= HOTSPOT_MIN_COUNT) {
        keptFeatures.push(feature)
        keptCenters.push({ x: projected.x, y: projected.y, radius: haloRadius })
      }
    }

    setVisibleGeojsonData({
      type: "FeatureCollection",
      features: keptFeatures,
    })
  }, [geojsonData, getCoreRadiusForCount])

  useEffect(() => {
    if (!isMapReady) return
    updateVisibleGeojsonData()
  }, [isMapReady, updateVisibleGeojsonData])

  const coreRadiusExpression = useMemo((): ExpressionSpecification => ["get", "radius"], [])
  const haloRadiusExpression = useMemo(
    (): ExpressionSpecification => ["*", coreRadiusExpression, HALO_RADIUS_SCALE],
    [coreRadiusExpression]
  )

  const mapStyle = useBasemapStyleUrl()

  // Handler to recenter the map to India
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [INDIA_MAP_VIEW.longitude, INDIA_MAP_VIEW.latitude],
        zoom: INDIA_MAP_VIEW.zoom,
        duration: 400,
      })
      captureEvent(ANALYTICS_EVENTS.MAP_RECENTER_CLICKED, {
        map_kind: "city",
        map_name: "centers_map",
      })
    }
  }

  // Show error if any
  if (dataError) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-base font-medium text-destructive mb-2">Could not load the map</p>
          <p className="text-sm text-muted-foreground">{dataError}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <MapErrorState heightClass={heightClass} kind={errorKind} onReload={reload} />
  }

  // Wait for client-side rendering
  // Wait for the worker file to be cached before MapLibre starts its workers.
  if (!isClient || !ready) {
    return <Skeleton className={`w-full ${heightClass} rounded-lg`} aria-label="Loading map" />
  }

  if (cityData.length === 0) {
    logger.warn("city_coordinate_data_missing", { centers_count: centers.length })
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-base font-medium text-foreground mb-2">No location data</p>
          <p className="text-sm text-muted-foreground">
            Centres do not have latitude and longitude information
          </p>
        </div>
      </div>
    )
  }

  logger.debug("rendering_map", { cities_count: cityData.length })

  try {
    const handleMapMoveTracked = (event: ViewStateChangeEvent) => {
      updateVisibleGeojsonData()
      const now = Date.now()
      const zoom = Number(event?.viewState?.zoom ?? 0)
      const latitude = Number(event?.viewState?.latitude ?? 0)
      const longitude = Number(event?.viewState?.longitude ?? 0)

      if (now - lastMapMoveTrackedAtRef.current >= 1500) {
        captureEvent(ANALYTICS_EVENTS.MAP_MOVED, {
          map_kind: "city",
          map_name: "centers_map",
          zoom: Number(zoom.toFixed(2)),
          latitude: Number(latitude.toFixed(4)),
          longitude: Number(longitude.toFixed(4)),
          visible_city_count: visibleGeojsonData?.features.length ?? geojsonData.features.length,
        })
        lastMapMoveTrackedAtRef.current = now
      }

      if (lastZoomTrackedRef.current === null || Math.abs(lastZoomTrackedRef.current - zoom) >= 0.3) {
        captureEvent(ANALYTICS_EVENTS.MAP_ZOOM_CHANGED, {
          map_kind: "city",
          map_name: "centers_map",
          zoom: Number(zoom.toFixed(2)),
        })
        lastZoomTrackedRef.current = zoom
      }
    }

    return (
      <div
        ref={containerRef}
        className={`relative w-full ${heightClass} rounded-lg overflow-hidden outline-none bg-muted`}
      >
        <MapGL
        key={mapKey}
        ref={mapRef}
        style={{ width: "100%", height: "100%" }}
        initialViewState={viewState ?? INDIA_MAP_VIEW}
        mapStyle={mapStyle}
        workerUrl={MAPLIBRE_WORKER_URL}
        transformRequest={transformMapRequest}
        // Switching theme swaps the basemap style, which resets borders and colours.
        onStyleData={(e) => prepareBasemap(e.target)}
        projection="mercator"
        onLoad={() => {
          handleLoad()
          const map = mapRef.current?.getMap()
          // Hide the basemap's de-facto international borders; India boundaries
          // come from the SOI overlay below.
          if (map) prepareBasemap(map)
          // Force a resize calculation after map loads to ensure it fills container
          setTimeout(() => {
            if (map?.resize) {
              map.resize()
            }
            setIsMapReady(true)
          }, 200)
        }}
        onMove={handleMapMoveTracked}
        onMoveEnd={(e) => onViewStateChange?.(e.viewState)}
        interactiveLayerIds={["centers-circles"]}
        onMouseMove={(e) => {
          const features = e.features
          if (features && features.length > 0) {
            const city = features[0].properties?.city
            setHoveredCity(city)
            setMousePosition({ x: e.point.x, y: e.point.y })
          } else {
            setHoveredCity(null)
            setMousePosition(null)
          }
        }}
        onMouseLeave={() => {
          setHoveredCity(null)
          setMousePosition(null)
        }}
        onError={(e) => {
          const source = (e as { sourceId?: string }).sourceId
          const message = e.error?.message ?? String(e.error ?? "unknown")
          // Per-source/tile errors are non-fatal (missing/aborted tiles, glyphs):
          // log at warn and keep the map up. A real style failure (no sourceId)
          // surfaces the error screen and analytics, like the choropleth map.
          if (source) {
            logger.warn("map_source_error", { source, message })
            return
          }
          logger.error("map_runtime_error", { message })
          // Retries once silently, then shows the error state (useMapRecovery).
          handleFatalError(message)
        }}
      >
        <MapControls onRecenter={handleRecenter} />

        <DebugLocationSearch mapRef={mapRef} />

        {/* Survey of India state boundaries (correct India viewpoint), drawn
            under the city bubbles since the basemap borders are hidden. */}
        <Source id="india-admin" type="geojson" data="/data/admin-1.geojson">
          <Layer
            id="india-admin-outline"
            type="line"
            paint={{
              "line-color": "#64748b",
              "line-width": 0.5,
              "line-opacity": 0.5,
            }}
          />
        </Source>

        <Source id="centers" type="geojson" data={visibleGeojsonData ?? geojsonData}>
          {/* Outer halo: a thin ring in a donut chart step, drawn below the core. A
              see-through orange fill reads as muddy brown on the dark basemap. */}
          <Layer
            id="centers-halo"
            type="circle"
            paint={{
              "circle-radius": haloRadiusExpression,
              "circle-color": DONUT_CHART_COLORS[3],
              "circle-opacity": 0.08,
              "circle-stroke-color": DONUT_CHART_COLORS[3],
              "circle-stroke-width": 1.5,
              "circle-stroke-opacity": 0.7,
              "circle-blur": 0,
            }}
          />
          
          {/* Inner core layer - crisp, fully opaque anchor */}
          <Layer
            id="centers-circles"
            type="circle"
            paint={{
              "circle-radius": coreRadiusExpression,
              "circle-color": DONUT_CHART_COLORS[5],
              "circle-opacity": 1,
              "circle-blur": 0,
            }}
          />

          <Layer
            id="centers-labels"
            type="symbol"
            filter={["==", ["get", "showLabel"], true]}
            layout={{
              "text-field": ["get", "label"],
              "text-size": ["get", "labelSize"],
              // Carto's glyph server only serves Open Sans (not Google Sans).
              "text-font": ["Open Sans Bold", "Open Sans Regular"],
              // Every bubble is drawn, but a number that would collide with
              // another is dropped, bigger cities first (a lower key places first).
              "text-allow-overlap": false,
              "text-ignore-placement": false,
              "symbol-sort-key": ["-", 0, ["get", "count"]],
            }}
            paint={{
              "text-color": "#ffffff",
            }}
          />
        </Source>

        {/* Enhanced Tooltip */}
        {hoveredCity && mousePosition && (() => {
          const cityInfo = cityData.find((c) => c.city === hoveredCity)
          if (!cityInfo) return null

          return (
            <div
              className="absolute z-50 pointer-events-none"
              ref={tooltipRef}
              style={{
                left: `${(tooltipPosition?.x ?? mousePosition.x + 15)}px`,
                top: `${(tooltipPosition?.y ?? mousePosition.y + 15)}px`,
              }}
            >
              <ChartTooltipCard
                variant="card"
                title={cityInfo.city}
                subtitle={cityInfo.country}
                lead={cityInfo.count.toLocaleString("en-US")}
                leadUnit={cityInfo.count === 1 ? "centre" : "centres"}
                lines={[
                  ...(showAccountsCount ? [{ label: "Accounts", value: cityInfo.accountsCount.toLocaleString("en-US") }] : []),
                  { label: "Headcount", value: cityInfo.headcount.toLocaleString("en-US") },
                ]}
              />
            </div>
          )
        })()}

        {/* Size legend: what a bubble's size means, drawn at the map's own sizes. */}
        {sizeLegend.length > 1 && (
          <div className="absolute bottom-4 left-4 z-10 rounded-lg border bg-card p-3 shadow-float">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Centres per city</div>
            <div className="flex items-end gap-4">
              {sizeLegend.map(({ count, radius }) => (
                <div key={count} className="flex flex-col items-center gap-1">
                  <span
                    className="block rounded-full"
                    style={{ width: radius * 2, height: radius * 2, background: DONUT_CHART_COLORS[5] }}
                    aria-hidden
                  />
                  <span className="text-[11px] tabular-nums text-muted-foreground">{count.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </MapGL>
    </div>
    )
  } catch (err) {
    logger.error("render_failed", { error: err })
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-base font-medium text-destructive mb-2">Could not draw the map</p>
          <p className="text-sm text-muted-foreground">
            {err instanceof Error ? err.message : "Unknown error occurred"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Check browser console for details</p>
        </div>
      </div>
    )
  }
}
