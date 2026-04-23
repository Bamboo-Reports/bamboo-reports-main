"use client"

import React, { useMemo, useState, useEffect, useLayoutEffect } from "react"
import { Map as MapGL, Source, Layer, NavigationControl, FullscreenControl } from "@vis.gl/react-maplibre"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getMaptilerCountriesTilesUrl, getMaptilerStyleUrl } from "@/lib/config/maptiler"
import type { Center } from "@/lib/types"
import "maplibre-gl/dist/maplibre-gl.css"

interface CentersChoroplethMapProps {
  centers: Center[]
  allCenters?: Center[]
  heightClass?: string
}

interface Admin1Properties {
  name?: string
  level_0?: string
  level?: number
  [key: string]: unknown
}

interface Admin1Feature {
  type?: "Feature"
  properties?: Admin1Properties
  geometry?: {
    type: "Polygon" | "MultiPolygon"
    coordinates: any
  }
}

const COLOR_SCALE = [
  "#FFF2BB",
  "#FFEEA2",
  "#FFE573",
  "#FFE056",
  "#FFDB39",
  "#F7CA02",
  "#FFB649",
  "#FFA92A",
  "#F59302",
  "#FF8000",
]

const normalizeIso2 = (value?: string | null) => (value || "").trim().toUpperCase()
const normalizeStateKey = (value?: string | null) => (value || "").trim().toLowerCase()
const makeKey = (countryIso2: string, stateKey: string) => `${countryIso2}|${stateKey}`
const makeFeatureKey = (countryIso2?: string | null, stateName?: string | null) =>
  makeKey(normalizeIso2(countryIso2), normalizeStateKey(stateName))

interface DisputedAliasRule {
  featureIso2: string
  featureStateNames: string[]
  aggregateIso2: string
  aggregateState: string
  displayCountry: string
  displayState: string
}

interface AliasMeta {
  aggregateKey: string
  displayCountry: string
  displayState: string
}

const DISPUTED_ALIAS_RULES_BY_VIEWPOINT: Record<string, DisputedAliasRule[]> = {
  IN: [
    {
      featureIso2: "PK",
      featureStateNames: [
        "azad kashmir",
        "azad jammu and kashmir",
        "gilgit-baltistan",
        "gilgit baltistan",
      ],
      aggregateIso2: "IN",
      aggregateState: "jammu and kashmir",
      displayCountry: "India",
      displayState: "Jammu and Kashmir",
    },
  ],
}

const buildStateAggregates = (centers: Center[]) => {
  const countsByState = new Map<string, number>()
  const accountsByState = new Map<string, Set<string>>()
  const headcountByState = new Map<string, number>()
  const countryNamesByIso = new Map<string, string>()

  centers.forEach((center) => {
    const state = normalizeStateKey(center.center_state)
    const countryIso2 = normalizeIso2(center.center_country_iso2)
    if (!state || !countryIso2) return
    const key = makeKey(countryIso2, state)
    countsByState.set(key, (countsByState.get(key) || 0) + 1)

    const accountName = center.account_global_legal_name
    if (accountName) {
      const accounts = accountsByState.get(key) ?? new Set<string>()
      accounts.add(accountName)
      accountsByState.set(key, accounts)
    }

    const employees = center.center_employees ?? 0
    headcountByState.set(key, (headcountByState.get(key) || 0) + employees)

    if (center.center_country) {
      countryNamesByIso.set(countryIso2, center.center_country)
    }
  })

  return { countsByState, accountsByState, headcountByState, countryNamesByIso }
}

const buildRenderAggregates = (
  stateAggregates: ReturnType<typeof buildStateAggregates>,
  viewpointIso2: string
) => {
  const countsByState = new Map(stateAggregates.countsByState)
  const accountsByState = new Map<string, Set<string>>()
  stateAggregates.accountsByState.forEach((accounts, key) => {
    accountsByState.set(key, new Set(accounts))
  })
  const headcountByState = new Map(stateAggregates.headcountByState)
  const aliasMetaByFeatureKey = new Map<string, AliasMeta>()

  const rules = DISPUTED_ALIAS_RULES_BY_VIEWPOINT[viewpointIso2] ?? []
  rules.forEach((rule) => {
    const aggregateKey = makeFeatureKey(rule.aggregateIso2, rule.aggregateState)
    const aggregateCount = stateAggregates.countsByState.get(aggregateKey) || 0
    if (aggregateCount <= 0) return

    const aggregateAccounts = stateAggregates.accountsByState.get(aggregateKey)
    const aggregateHeadcount = stateAggregates.headcountByState.get(aggregateKey) || 0

    rule.featureStateNames.forEach((featureStateName) => {
      const featureKey = makeFeatureKey(rule.featureIso2, featureStateName)
      countsByState.set(featureKey, aggregateCount)
      if (aggregateAccounts) {
        accountsByState.set(featureKey, new Set(aggregateAccounts))
      }
      headcountByState.set(featureKey, aggregateHeadcount)
      aliasMetaByFeatureKey.set(featureKey, {
        aggregateKey,
        displayCountry: rule.displayCountry,
        displayState: rule.displayState,
      })
    })
  })

  return {
    countsByState,
    accountsByState,
    headcountByState,
    aliasMetaByFeatureKey,
  }
}

const buildColorScale = (values: number[], countExpression: any) => {
  const computedMax = values.length > 0 ? Math.max(...values) : 0
  const computedMin = values.length > 0 ? Math.min(...values) : 0
  const maxValue = Math.max(0, computedMax)
  const minValue = computedMin > 0 ? computedMin : 1

  if (maxValue <= 0) {
    return {
      expression: ["step", countExpression, COLOR_SCALE[0], 1, COLOR_SCALE[1]] as any,
      legend: [
        { label: "0", color: COLOR_SCALE[0] },
        { label: "1+", color: COLOR_SCALE[1] },
      ],
    }
  }

  if (minValue >= maxValue) {
    const color = COLOR_SCALE[COLOR_SCALE.length - 1]
    return {
      expression: ["case", [">", countExpression, 0], color, COLOR_SCALE[0]] as any,
      legend: [
        { label: minValue.toLocaleString(), color },
      ],
    }
  }

  const thresholds: number[] = []
  const steps = COLOR_SCALE.length
  const range = maxValue - minValue
  for (let i = 1; i < steps; i += 1) {
    const value = minValue + (range * i) / steps
    thresholds.push(Math.max(minValue, Math.ceil(value)))
  }

  const uniqueThresholds: number[] = []
  for (const value of thresholds) {
    if (uniqueThresholds.length === 0 || value > uniqueThresholds[uniqueThresholds.length - 1]) {
      uniqueThresholds.push(value)
    }
  }

  const bucketCount = uniqueThresholds.length + 1
  const maxColorIndex = COLOR_SCALE.length - 1
  const colors = Array.from({ length: bucketCount }, (_, index) => {
    if (bucketCount === 1) return COLOR_SCALE[maxColorIndex]
    const step = maxColorIndex / (bucketCount - 1)
    return COLOR_SCALE[Math.round(index * step)]
  })
  const expression: any[] = ["step", countExpression, colors[0]]
  uniqueThresholds.forEach((threshold, index) => {
    expression.push(threshold, colors[index + 1])
  })

  const legend: Array<{ label: string; color: string }> = []
  const formatRange = (min: number, max: number | null) => {
    if (max === null) return `${min}+`
    if (min === max) return `${min}`
    return `${min}-${max}`
  }

  if (uniqueThresholds.length > 0) {
    const firstMax = uniqueThresholds[0] - 1
    if (firstMax >= minValue) {
      legend.push({
        label: formatRange(minValue, firstMax),
        color: colors[0],
      })
    }

    uniqueThresholds.forEach((threshold, index) => {
      const nextThreshold = uniqueThresholds[index + 1]
      const max = nextThreshold ? Math.max(threshold, nextThreshold - 1) : null
      legend.push({
        label: formatRange(threshold, max),
        color: colors[index + 1],
      })
    })
  }

  return { expression, legend }
}

export function CentersChoroplethMap({
  centers,
  allCenters,
  heightClass = "h-[750px]",
}: CentersChoroplethMapProps) {
  const mapViewpointIso2 = normalizeIso2(process.env.NEXT_PUBLIC_MAP_VIEWPOINT_ISO2)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{
    x: number
    y: number
    state: string
    country: string
    count: number
    accountsCount: number
    headcount: number
  } | null>(null)
  const [hoveredFeatureKeys, setHoveredFeatureKeys] = useState<string[] | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const mapRef = React.useRef<any>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const tooltipRef = React.useRef<HTMLDivElement | null>(null)
  const lastMapMoveTrackedAtRef = React.useRef(0)
  const lastZoomTrackedRef = React.useRef<number | null>(null)
  const lastTooltipStateRef = React.useRef<string | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useLayoutEffect(() => {
    if (!hoverInfo || !containerRef.current || !tooltipRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const margin = 8
    const offset = 15

    let x = hoverInfo.x + offset
    let y = hoverInfo.y + offset

    if (x + tooltipRect.width + margin > containerRect.width) {
      x = hoverInfo.x - tooltipRect.width - offset
    }
    if (x < margin) {
      x = margin
    }

    if (y + tooltipRect.height + margin > containerRect.height) {
      y = hoverInfo.y - tooltipRect.height - offset
    }
    if (y < margin) {
      y = margin
    }

    setTooltipPosition({ x, y })
  }, [hoverInfo])

  useEffect(() => {
    if (!hoverInfo) {
      lastTooltipStateRef.current = null
      return
    }

    const stateKey = `${hoverInfo.country}|${hoverInfo.state}`
    if (lastTooltipStateRef.current === stateKey) {
      return
    }

    captureEvent(ANALYTICS_EVENTS.MAP_TOOLTIP_VIEWED, {
      map_kind: "state",
      map_name: "centers_choropleth_map",
      state: hoverInfo.state,
      country: hoverInfo.country,
      center_count: hoverInfo.count,
      accounts_count: hoverInfo.accountsCount,
    })
    lastTooltipStateRef.current = stateKey
  }, [hoverInfo])

  useEffect(() => {
    const fallback = setTimeout(() => setIsMapReady(true), 700)
    return () => clearTimeout(fallback)
  }, [])

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

    requestAnimationFrame(resizeMap)

    return () => observer.disconnect()
  }, [isClient])

  const stateAggregates = useMemo(() => buildStateAggregates(centers), [centers])
  const renderAggregates = useMemo(
    () => buildRenderAggregates(stateAggregates, mapViewpointIso2),
    [mapViewpointIso2, stateAggregates]
  )
  const scaleAggregates = useMemo(() => {
    const centersForScale = allCenters && allCenters.length > 0 ? allCenters : centers
    return buildStateAggregates(centersForScale)
  }, [allCenters, centers])

  const countValues = useMemo(
    () => Array.from(scaleAggregates.countsByState.values()).filter((value) => value > 0),
    [scaleAggregates]
  )
  const countRange = useMemo(() => {
    if (countValues.length === 0) return { min: 0, max: 0 }
    return {
      min: Math.min(...countValues),
      max: Math.max(...countValues),
    }
  }, [countValues])

  const featureKeyExpression = useMemo(
    () => (["concat", ["get", "level_0"], "|", ["downcase", ["coalesce", ["get", "name"], ""]]] as any),
    []
  )

  const stateKeysWithCounts = useMemo(() => {
    const keys: string[] = []
    renderAggregates.countsByState.forEach((value, key) => {
      if (value > 0) keys.push(key)
    })
    return keys
  }, [renderAggregates])

  const countExpression = useMemo(() => {
    if (stateKeysWithCounts.length === 0) return ["literal", 0] as any
    const expression: any[] = ["match", featureKeyExpression]
    renderAggregates.countsByState.forEach((value, key) => {
      if (value > 0) {
        expression.push(key, value)
      }
    })
    expression.push(0)
    return expression
  }, [featureKeyExpression, renderAggregates, stateKeysWithCounts])

  const { expression: fillColorExpression } = useMemo(
    () => buildColorScale(countValues, countExpression),
    [countValues, countExpression]
  )

  const layerFilter = useMemo(() => {
    if (stateKeysWithCounts.length === 0) {
      return ["==", 0, 1] as any
    }
    return ["all", ["==", ["get", "level"], 1], ["in", featureKeyExpression, ["literal", stateKeysWithCounts]]] as any
  }, [featureKeyExpression, stateKeysWithCounts])

  const mergedRegionFeatureKeys = useMemo(() => {
    const keys = new Set<string>()
    renderAggregates.aliasMetaByFeatureKey.forEach((meta, featureKey) => {
      keys.add(featureKey)
      keys.add(meta.aggregateKey)
    })
    return Array.from(keys)
  }, [renderAggregates])

  const outlineLayerFilter = useMemo(() => {
    if (mergedRegionFeatureKeys.length === 0) return layerFilter
    return [
      "all",
      layerFilter,
      ["!", ["in", featureKeyExpression, ["literal", mergedRegionFeatureKeys]]],
    ] as any
  }, [featureKeyExpression, layerFilter, mergedRegionFeatureKeys])

  const hoverLayerFilter = useMemo(() => {
    if (!hoveredFeatureKeys || hoveredFeatureKeys.length === 0) {
      return ["==", ["get", "name"], "__never_hovered_state__"] as any
    }
    return [
      "all",
      ["==", ["get", "level"], 1],
      ["in", featureKeyExpression, ["literal", hoveredFeatureKeys]],
    ] as any
  }, [featureKeyExpression, hoveredFeatureKeys])

  const bounds = useMemo(() => {
    const coords = centers
      .map((center) => ({ lat: center.lat, lng: center.lng }))
      .filter((c) => typeof c.lat === "number" && typeof c.lng === "number") as Array<{
      lat: number
      lng: number
    }>

    if (coords.length === 0) return null

    let minLat = coords[0].lat
    let maxLat = coords[0].lat
    let minLng = coords[0].lng
    let maxLng = coords[0].lng

    coords.forEach((coord) => {
      minLat = Math.min(minLat, coord.lat)
      maxLat = Math.max(maxLat, coord.lat)
      minLng = Math.min(minLng, coord.lng)
      maxLng = Math.max(maxLng, coord.lng)
    })

    return {
      minLat,
      maxLat,
      minLng,
      maxLng,
    }
  }, [centers])

  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY
  const mapStyle = maptilerKey
    ? getMaptilerStyleUrl("state", maptilerKey)
    : ""
  const countriesTileUrl = maptilerKey
    ? getMaptilerCountriesTilesUrl(maptilerKey)
    : ""

  const handleRecenter = () => {
    const mapInstance = mapRef.current?.getMap?.() ?? mapRef.current
    if (!mapInstance) return

    mapInstance.flyTo({
      center: [78.9629, 20.5937],
      zoom: 3.5,
      duration: 800,
    })
    captureEvent(ANALYTICS_EVENTS.MAP_RECENTER_CLICKED, {
      map_kind: "state",
      map_name: "centers_choropleth_map",
    })
  }

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

  if (!isClient) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }

  if (!maptilerKey) {
    console.error("[CentersChoroplethMap] MapTiler key is missing")
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-lg font-semibold text-muted-foreground mb-2">
            MapTiler API Key Missing
          </p>
          <p className="text-sm text-muted-foreground">
            Please set NEXT_PUBLIC_MAPTILER_KEY in your environment variables
          </p>
        </div>
      </div>
    )
  }

  if (stateKeysWithCounts.length === 0) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No state boundaries to display.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${heightClass} rounded-lg overflow-hidden outline-none bg-muted`}
    >
      <MapGL
        ref={mapRef}
        style={{ width: "100%", height: "100%" }}
        initialViewState={{
          latitude: 15,
          longitude: 0,
          zoom: 1.6,
        }}
        mapStyle={mapStyle}
        projection="mercator"
        onLoad={(e) => {
          setTimeout(() => {
            e.target.resize()
            handleRecenter()
            setIsMapReady(true)
          }, 200)
        }}
        interactiveLayerIds={["admin1-fill"]}
        onMove={(event) => {
          const now = Date.now()
          const zoom = Number(event?.viewState?.zoom ?? 0)
          const latitude = Number(event?.viewState?.latitude ?? 0)
          const longitude = Number(event?.viewState?.longitude ?? 0)

          if (now - lastMapMoveTrackedAtRef.current >= 1500) {
            captureEvent(ANALYTICS_EVENTS.MAP_MOVED, {
              map_kind: "state",
              map_name: "centers_choropleth_map",
              zoom: Number(zoom.toFixed(2)),
              latitude: Number(latitude.toFixed(4)),
              longitude: Number(longitude.toFixed(4)),
              visible_state_count: stateKeysWithCounts.length,
            })
            lastMapMoveTrackedAtRef.current = now
          }

          if (lastZoomTrackedRef.current === null || Math.abs(lastZoomTrackedRef.current - zoom) >= 0.3) {
            captureEvent(ANALYTICS_EVENTS.MAP_ZOOM_CHANGED, {
              map_kind: "state",
              map_name: "centers_choropleth_map",
              zoom: Number(zoom.toFixed(2)),
            })
            lastZoomTrackedRef.current = zoom
          }
        }}
        onMouseMove={(e) => {
          const feature = e.features?.[0] as Admin1Feature | undefined
          if (!feature) {
            setHoverInfo(null)
            setHoveredFeatureKeys(null)
            return
          }
          const props = feature.properties || {}
          const stateName = (props.name || "").toString()
          const iso2 = (props.level_0 || "").toString()
          const key = makeFeatureKey(iso2, stateName)
          const aliasMeta = renderAggregates.aliasMetaByFeatureKey.get(key)
          const aggregateKey = aliasMeta?.aggregateKey || key
          const linkedFeatureKeys = Array.from(renderAggregates.aliasMetaByFeatureKey.entries())
            .filter(([, meta]) => meta.aggregateKey === aggregateKey)
            .map(([featureKey]) => featureKey)
          if (linkedFeatureKeys.length === 0 || !linkedFeatureKeys.includes(aggregateKey)) {
            linkedFeatureKeys.push(aggregateKey)
          }
          setHoveredFeatureKeys(linkedFeatureKeys)
          const count = renderAggregates.countsByState.get(key) || 0
          const accountsCount = renderAggregates.accountsByState.get(key)?.size || 0
          const headcount = renderAggregates.headcountByState.get(key) || 0
          const countryName = aliasMeta?.displayCountry || stateAggregates.countryNamesByIso.get(iso2) || iso2
          const stateLabel = aliasMeta?.displayState || stateName || "Unknown State"
          setHoverInfo({
            x: e.point.x,
            y: e.point.y,
            state: stateLabel,
            country: countryName || "Unknown Country",
            count,
            accountsCount,
            headcount,
          })
        }}
        onMouseLeave={() => {
          setHoverInfo(null)
          setHoveredFeatureKeys(null)
        }}
        onError={(e) => {
          console.error("[CentersChoroplethMap] Map error:", e)
          setError(`Map error: ${e.error?.message || "Unknown error"}`)
          captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, {
            map_kind: "state",
            map_name: "centers_choropleth_map",
            error_message: e.error?.message || "Unknown map error",
          })
        }}
      >
        <NavigationControl position="top-left" showCompass={true} showZoom={true} />
        <FullscreenControl position="top-left" />

        <Source id="admin1" type="vector" url={countriesTileUrl}>
          <Layer
            id="admin1-fill"
            type="fill"
            source-layer="administrative"
            filter={layerFilter}
            paint={{
              "fill-color": fillColorExpression,
              "fill-outline-color": fillColorExpression,
              "fill-antialias": true,
              "fill-opacity": 1,
            }}
          />
          <Layer
            id="admin1-outline"
            type="line"
            source-layer="administrative"
            filter={outlineLayerFilter}
            paint={{
              "line-color": "#ffffff",
              "line-width": 0.7,
              "line-opacity": 0.8,
            }}
          />
          <Layer
            id="admin1-hover-fill"
            type="fill"
            source-layer="administrative"
            filter={hoverLayerFilter}
            paint={{
              "fill-color": "#f97316",
              "fill-outline-color": "rgba(0,0,0,0)",
              "fill-antialias": true,
              "fill-opacity": 0.2,
            }}
          />
        </Source>

        <div
          className="absolute bottom-4 left-4 z-10 rounded-lg border bg-background/35 backdrop-blur-md p-3 shadow-sm min-w-[220px]"
          style={{
            fontFamily:
              "'Google Sans', 'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div className="text-sm font-semibold text-muted-foreground dark:text-white mb-2 text-center">Total Centers</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground dark:text-white">
            <span className="tabular-nums">{countRange.min.toLocaleString()}</span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${COLOR_SCALE.join(", ")})`,
              }}
            />
            <span className="tabular-nums">{countRange.max.toLocaleString()}</span>
          </div>
        </div>

        {hoverInfo && (
          <div
            className="absolute z-50 pointer-events-none"
            ref={tooltipRef}
            style={{
              left: `${(tooltipPosition?.x ?? hoverInfo.x + 15)}px`,
              top: `${(tooltipPosition?.y ?? hoverInfo.y + 15)}px`,
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
                    {hoverInfo.state || "Unknown State"}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {hoverInfo.country || "Unknown Country"}
                  </div>
                </div>

                {/* Hero metric: centers count */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold leading-none tabular-nums text-foreground">
                    {hoverInfo.count.toLocaleString()}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {hoverInfo.count === 1 ? 'center' : 'centers'}
                  </span>
                </div>

                {/* Secondary metrics */}
                <div className="space-y-1 border-t border-border/60 pt-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Accounts</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {hoverInfo.accountsCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Headcount</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {hoverInfo.headcount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </MapGL>
    </div>
  )
}
