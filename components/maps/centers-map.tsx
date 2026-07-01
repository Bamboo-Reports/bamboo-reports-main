"use client"

import React, { useMemo, useState, useEffect, useCallback, useLayoutEffect } from "react"
import { Map as MapGL, Source, Layer, NavigationControl, FullscreenControl } from "@vis.gl/react-maplibre"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { BASEMAP_STYLE_URL, hideBasemapBoundaries } from "@/lib/maps/basemap"
import { DebugLocationSearch } from "@/components/maps/debug-location-search"
import { createLogger } from "@/lib/logger"
import type { Center } from "@/lib/types"
import "maplibre-gl/dist/maplibre-gl.css"

interface CentersMapProps {
  centers: Center[]
  heightClass?: string
  showAccountsCount?: boolean
}

interface CityCluster {
  city: string
  country: string
  lat: number
  lng: number
  count: number
  accounts: Set<string>
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

const HALO_RADIUS_SCALE = 1.5
const OVERLAP_PADDING = 0.5
const logger = createLogger("components/CentersMap")

export function CentersMap({ centers, heightClass = "h-[750px]", showAccountsCount = true }: CentersMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [visibleGeojsonData, setVisibleGeojsonData] = useState<CityFeatureCollection | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const mapRef = React.useRef<any>(null)
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

  useEffect(() => {
    if (!hoveredCity) {
      lastTooltipCityRef.current = null
      return
    }

    if (lastTooltipCityRef.current === hoveredCity) {
      return
    }

    const matchingCenters = centers.filter((center) => center.center_city === hoveredCity)
    const accounts = new Set(matchingCenters.map((center) => center.account_global_legal_name).filter(Boolean))
    const totalHeadcount = matchingCenters.reduce((sum, center) => sum + (center.center_employees ?? 0), 0)
    const country = matchingCenters.find((center) => center.center_country)?.center_country ?? null
    captureEvent(ANALYTICS_EVENTS.MAP_TOOLTIP_VIEWED, {
      map_kind: "city",
      map_name: "centers_map",
      city: hoveredCity,
      country,
      center_count: matchingCenters.length,
      accounts_count: accounts.size,
      headcount: totalHeadcount,
    })
    lastTooltipCityRef.current = hoveredCity
  }, [hoveredCity, centers])

  // Fallback to ensure the map shows even if onLoad is delayed
  useEffect(() => {
    const fallback = setTimeout(() => setIsMapReady(true), 700)
    return () => clearTimeout(fallback)
  }, [])

  // Force map to recalc size when container changes to avoid clipped bottom
  useEffect(() => {
    if (!isClient || typeof ResizeObserver === "undefined") return
    const container = containerRef.current
    if (!container) return

    const resizeMap = () => {
      if (mapRef.current?.resize) {
        mapRef.current.resize()
      }
    }

    const observer = new ResizeObserver(resizeMap)
    observer.observe(container)

    // Initial pass after layout
    requestAnimationFrame(resizeMap)

    return () => observer.disconnect()
  }, [isClient])

  // Aggregate centers by city and calculate cluster data
  const cityData = useMemo(() => {
    try {
      logger.debug("city_data_calculation_started", { centers_count: centers.length })
      const cityMap = new Map<string, CityCluster>()

      centers.forEach((center) => {
        const city = center.center_city
        const country = center.center_country
        const account = center.account_global_legal_name
        const employees = center.center_employees ?? 0
        const lat = center.lat
        const lng = center.lng

        // Skip if no coordinates or city
        if (lat === null || lat === undefined || lng === null || lng === undefined || isNaN(lat) || isNaN(lng)) {
          return
        }
        if (!city) return

        if (cityMap.has(city)) {
          const existing = cityMap.get(city)!
          existing.accounts.add(account)
          cityMap.set(city, {
            ...existing,
            count: existing.count + 1,
            headcount: existing.headcount + employees,
          })
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
            headcount: employees,
          })
        }
      })

      const result = Array.from(cityMap.values())
      logger.debug("city_data_calculated", { cities_count: result.length })
      return result
    } catch (err) {
      logger.error("city_data_calculation_failed", { error: err })
      setError(err instanceof Error ? err.message : "Error calculating city data")
      return []
    }
  }, [centers])

  // Calculate center of all points for initial view
  const initialViewState = useMemo(() => {
    if (cityData.length === 0) {
      return {
        latitude: 20.5937,
        longitude: 78.9629,
        zoom: 4,
      }
    }

    const avgLat = cityData.reduce((sum, city) => sum + city.lat, 0) / cityData.length
    const avgLng = cityData.reduce((sum, city) => sum + city.lng, 0) / cityData.length

    // Dynamically adjust zoom based on number of centers
    let zoom = 4
    if (cityData.length === 1) {
      zoom = 8
    } else if (cityData.length <= 3) {
      zoom = 6
    } else if (cityData.length <= 10) {
      zoom = 5
    }

    return {
      latitude: avgLat,
      longitude: avgLng,
      zoom,
    }
  }, [cityData])

  const getCoreRadiusForCount = useCallback((count: number) => {
    const minCount = 1
    const maxCount = Math.max(...cityData.map(c => c.count), 1)
    const minRadius = 4
    const maxRadius = 20

    if (maxCount === minCount) return minRadius

    const logCount = Math.log10(count)
    const logMin = Math.log10(minCount)
    const logMax = Math.log10(maxCount)

    const normalized = (logCount - logMin) / (logMax - logMin)
    return minRadius + normalized * (maxRadius - minRadius)
  }, [cityData])

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
            accountsCount: city.accounts.size,
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
    const mapInstance = mapRef.current?.getMap?.() ?? mapRef.current
    if (!mapInstance?.project || geojsonData.features.length === 0) {
      setVisibleGeojsonData(geojsonData)
      return
    }

    const keptFeatures: CityFeature[] = []
    const keptCenters: Array<{ x: number; y: number; radius: number }> = []

    for (const feature of geojsonData.features) {
      const [lng, lat] = feature.geometry.coordinates
      const projected = mapInstance.project([lng, lat])
      const coreRadius = getCoreRadiusForCount(feature.properties.count)
      const haloRadius = coreRadius * HALO_RADIUS_SCALE + OVERLAP_PADDING

      let overlaps = false
      for (const kept of keptCenters) {
        const dx = projected.x - kept.x
        const dy = projected.y - kept.y
        const minDistance = haloRadius + kept.radius
        if (dx * dx + dy * dy < minDistance * minDistance) {
          overlaps = true
          break
        }
      }

      if (!overlaps) {
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

  const coreRadiusExpression = useMemo(() => ["get", "radius"] as any, [])
  const haloRadiusExpression = useMemo(
    () => ["*", coreRadiusExpression, HALO_RADIUS_SCALE] as any,
    [coreRadiusExpression]
  )

  const mapStyle = BASEMAP_STYLE_URL

  // Handler to recenter the map to India
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [78.9629, 20.5937], // Center of India
        zoom: 3.5,
        duration: 1000,
      })
      captureEvent(ANALYTICS_EVENTS.MAP_RECENTER_CLICKED, {
        map_kind: "city",
        map_name: "centers_map",
      })
    }
  }

  // Show error if any
  if (error) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-lg font-semibold text-red-500 mb-2">Error Loading Map</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">Check browser console for details</p>
        </div>
      </div>
    )
  }

  // Wait for client-side rendering
  if (!isClient) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }

  if (cityData.length === 0) {
    logger.warn("city_coordinate_data_missing", { centers_count: centers.length })
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-lg font-semibold text-muted-foreground mb-2">No Location Data</p>
          <p className="text-sm text-muted-foreground">
            Centers do not have latitude and longitude information
          </p>
        </div>
      </div>
    )
  }

  logger.debug("rendering_map", { cities_count: cityData.length })

  try {
    const handleMapMoveTracked = (event: any) => {
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
        ref={mapRef}
        style={{ width: "100%", height: "100%" }}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        projection="mercator"
        onLoad={() => {
          const map = mapRef.current?.getMap?.() ?? mapRef.current
          // Hide the basemap's de-facto international borders; India boundaries
          // come from the SOI overlay below.
          if (map) hideBasemapBoundaries(map)
          // Force a resize calculation after map loads to ensure it fills container
          setTimeout(() => {
            if (map?.resize) {
              map.resize()
            }
            handleRecenter()
            setIsMapReady(true)
          }, 200)
        }}
        onMove={handleMapMoveTracked}
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
          setError(`Map error: ${message}`)
          captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, {
            map_kind: "city",
            map_name: "centers_map",
            error_message: message,
          })
        }}
      >
        {/* Navigation Controls - Zoom and Rotation */}
        <NavigationControl position="top-left" showCompass={true} showZoom={true} />

        {/* Fullscreen Control */}
        <FullscreenControl position="top-left" />

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
          {/* Outer halo layer - crisp, flat, and rendered below core for clean overlap */}
          <Layer
            id="centers-halo"
            type="circle"
            paint={{
              "circle-radius": haloRadiusExpression,
              "circle-color": "#ffbf57",
              "circle-opacity": 0.25,
              "circle-blur": 0,
            }}
          />
          
          {/* Inner core layer - crisp, fully opaque anchor */}
          <Layer
            id="centers-circles"
            type="circle"
            paint={{
              "circle-radius": coreRadiusExpression,
              "circle-color": "#ff6800",
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
              "text-allow-overlap": true,
              "text-ignore-placement": true,
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
                fontFamily:
                  "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              <div className="flex min-w-[220px] overflow-hidden rounded-lg border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="w-0.5 bg-orange-500/80" aria-hidden="true" />
                <div className="flex-1 space-y-3 p-3.5">
                  {/* Location */}
                  <div>
                    <div className="text-[11px] font-semibold uppercase leading-tight tracking-[0.14em] text-foreground">
                      {cityInfo.city}
                    </div>
                    <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {cityInfo.country}
                    </div>
                  </div>

                  {/* Hero metric: centers count */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-foreground">
                      {cityInfo.count.toLocaleString()}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {cityInfo.count === 1 ? 'center' : 'centers'}
                    </span>
                  </div>

                  {/* Secondary metrics */}
                  <div className="space-y-1 border-t border-border/60 pt-2 text-xs">
                    {showAccountsCount && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Accounts</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {cityInfo.accounts.size.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Headcount</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {cityInfo.headcount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </MapGL>
    </div>
    )
  } catch (err) {
    logger.error("render_failed", { error: err })
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-lg font-semibold text-red-500 mb-2">Map Rendering Error</p>
          <p className="text-sm text-muted-foreground">
            {err instanceof Error ? err.message : "Unknown error occurred"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Check browser console for details</p>
        </div>
      </div>
    )
  }
}
