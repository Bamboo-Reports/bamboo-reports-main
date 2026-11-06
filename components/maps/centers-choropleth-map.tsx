"use client"

import { ChartTooltipCard } from "@/components/ui/chart-tooltip-card"
import React, { useMemo, useState, useEffect, useLayoutEffect } from "react"
import { Map as MapGL, Source, Layer, NavigationControl, FullscreenControl, type MapRef } from "@vis.gl/react-maplibre"
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { MAPLIBRE_WORKER_URL, prepareBasemap, transformMapRequest, useBasemapStyleUrl } from "@/lib/maps/basemap"
import { useMapRecovery } from "@/lib/maps/use-map-recovery"
import { MapErrorState } from "@/components/maps/map-error-state"
import { DebugLocationSearch } from "@/components/maps/debug-location-search"
import { devError } from "@/lib/utils/dev-log"
import type { Center } from "@/lib/types"
import type { StateAggregate } from "@/lib/dashboard/api-client"
import "maplibre-gl/dist/maplibre-gl.css"
import { countsTowardHeadcount } from "@/lib/dashboard/headcount"

interface CentersChoroplethMapProps {
  centers: Center[]
  allCenters?: Center[]
  /** Server mode (#249): pre-aggregated state data replaces the client computation over `centers`. */
  states?: StateAggregate[] | null
  /** Server mode: unfiltered aggregates for the color scale (replaces `allCenters`). */
  scaleStates?: StateAggregate[] | null
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
    coordinates: unknown
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

type StateAggregates = {
  countsByState: Map<string, number>
  accountsCountByState: Map<string, number>
  headcountByState: Map<string, number>
  countryNamesByIso: Map<string, string>
}

const buildStateAggregates = (centers: Center[]): StateAggregates => {
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

    // Same rule as the Headcount card: some centre types are left out.
    const employees = countsTowardHeadcount(center.center_type) ? (center.center_employees ?? 0) : 0
    headcountByState.set(key, (headcountByState.get(key) || 0) + employees)

    if (center.center_country) {
      countryNamesByIso.set(countryIso2, center.center_country)
    }
  })

  const accountsCountByState = new Map<string, number>()
  accountsByState.forEach((accounts, key) => accountsCountByState.set(key, accounts.size))

  return { countsByState, accountsCountByState, headcountByState, countryNamesByIso }
}

/** Server mode: the same aggregate maps, built from /api/centers/map state rows. */
const aggregatesFromStateRows = (rows: StateAggregate[]): StateAggregates => {
  const countsByState = new Map<string, number>()
  const accountsCountByState = new Map<string, number>()
  const headcountByState = new Map<string, number>()
  const countryNamesByIso = new Map<string, string>()

  rows.forEach((row) => {
    const key = makeKey(normalizeIso2(row.countryIso2), normalizeStateKey(row.stateKey))
    countsByState.set(key, row.count)
    accountsCountByState.set(key, row.accountsCount)
    headcountByState.set(key, row.headcount)
    if (row.countryName) {
      countryNamesByIso.set(normalizeIso2(row.countryIso2), row.countryName)
    }
  })

  return { countsByState, accountsCountByState, headcountByState, countryNamesByIso }
}

const buildColorScale = (values: number[], countExpression: ExpressionSpecification) => {
  const computedMax = values.length > 0 ? Math.max(...values) : 0
  const computedMin = values.length > 0 ? Math.min(...values) : 0
  const maxValue = Math.max(0, computedMax)
  const minValue = computedMin > 0 ? computedMin : 1

  if (maxValue <= 0) {
    return {
      expression: ["step", countExpression, COLOR_SCALE[0], 1, COLOR_SCALE[1]] as ExpressionSpecification,
      legend: [
        { label: "0", color: COLOR_SCALE[0] },
        { label: "1+", color: COLOR_SCALE[1] },
      ],
    }
  }

  if (minValue >= maxValue) {
    const color = COLOR_SCALE[COLOR_SCALE.length - 1]
    return {
      expression: ["case", [">", countExpression, 0], color, COLOR_SCALE[0]] as ExpressionSpecification,
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
  // Built step by step, so typed once complete.
  const stepParts: Array<ExpressionSpecification | string | number> = ["step", countExpression, colors[0]]
  uniqueThresholds.forEach((threshold, index) => {
    stepParts.push(threshold, colors[index + 1])
  })
  const expression = stepParts as ExpressionSpecification

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
  states,
  scaleStates,
  heightClass = "h-[750px]",
}: CentersChoroplethMapProps) {
  const { mapKey, ready, error, errorKind, handleFatalError, handleLoad, reload } = useMapRecovery({
    map_kind: "state",
    map_name: "centers_choropleth_map",
  })
  const [isClient, setIsClient] = useState(false)
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
  const mapRef = React.useRef<MapRef>(null)
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

  const stateAggregates = useMemo(
    () => (states ? aggregatesFromStateRows(states) : buildStateAggregates(centers)),
    [states, centers]
  )
  const scaleAggregates = useMemo(() => {
    if (scaleStates && scaleStates.length > 0) return aggregatesFromStateRows(scaleStates)
    if (states) return aggregatesFromStateRows(states)
    const centersForScale = allCenters && allCenters.length > 0 ? allCenters : centers
    return buildStateAggregates(centersForScale)
  }, [scaleStates, states, allCenters, centers])

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
    (): ExpressionSpecification => ["concat", ["get", "level_0"], "|", ["downcase", ["coalesce", ["get", "name"], ""]]],
    []
  )

  const stateKeysWithCounts = useMemo(() => {
    const keys: string[] = []
    stateAggregates.countsByState.forEach((value, key) => {
      if (value > 0) keys.push(key)
    })
    return keys
  }, [stateAggregates])

  const countExpression = useMemo((): ExpressionSpecification => {
    if (stateKeysWithCounts.length === 0) return ["literal", 0]
    // Built pair by pair, so typed once complete.
    const match: Array<ExpressionSpecification | string | number> = ["match", featureKeyExpression]
    stateAggregates.countsByState.forEach((value, key) => {
      if (value > 0) {
        match.push(key, value)
      }
    })
    match.push(0)
    return match as ExpressionSpecification
  }, [featureKeyExpression, stateAggregates, stateKeysWithCounts])

  const { expression: fillColorExpression } = useMemo(
    () => buildColorScale(countValues, countExpression),
    [countValues, countExpression]
  )

  const layerFilter = useMemo((): FilterSpecification => {
    if (stateKeysWithCounts.length === 0) {
      return ["==", 0, 1]
    }
    return ["all", ["==", ["get", "level"], 1], ["in", featureKeyExpression, ["literal", stateKeysWithCounts]]]
  }, [featureKeyExpression, stateKeysWithCounts])

  const hoverLayerFilter = useMemo((): FilterSpecification => {
    if (!hoveredFeatureKeys || hoveredFeatureKeys.length === 0) {
      return ["==", ["get", "name"], "__never_hovered_state__"]
    }
    return [
      "all",
      ["==", ["get", "level"], 1],
      ["in", featureKeyExpression, ["literal", hoveredFeatureKeys]],
    ]
  }, [featureKeyExpression, hoveredFeatureKeys])

  const mapStyle = useBasemapStyleUrl()

  const handleRecenter = () => {
    const mapInstance = mapRef.current?.getMap()
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
    return <MapErrorState heightClass={heightClass} kind={errorKind} onReload={reload} />
  }

  // Wait for the worker file to be cached before MapLibre starts its workers.
  if (!isClient || !ready) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Loading map…</p>
        </div>
      </div>
    )
  }

  if (stateKeysWithCounts.length === 0) {
    return (
      <div className={`flex items-center justify-center ${heightClass} bg-muted rounded-lg`}>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No state boundaries to show</p>
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
        key={mapKey}
        ref={mapRef}
        style={{ width: "100%", height: "100%" }}
        initialViewState={{
          latitude: 15,
          longitude: 0,
          zoom: 1.6,
        }}
        mapStyle={mapStyle}
        workerUrl={MAPLIBRE_WORKER_URL}
        transformRequest={transformMapRequest}
        // Switching theme swaps the basemap style, which resets borders and colours.
        onStyleData={(e) => prepareBasemap(e.target)}
        projection="mercator"
        onLoad={(e) => {
          handleLoad()
          // Hide the basemap's de-facto international borders; India boundaries
          // come from the SOI overlay below.
          prepareBasemap(e.target)
          setTimeout(() => {
            e.target.resize()
            handleRecenter()
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
          setHoveredFeatureKeys([key])
          const count = stateAggregates.countsByState.get(key) || 0
          const accountsCount = stateAggregates.accountsCountByState.get(key) || 0
          const headcount = stateAggregates.headcountByState.get(key) || 0
          const countryName = stateAggregates.countryNamesByIso.get(iso2) || iso2
          const stateLabel = stateName || "Unknown state"
          setHoverInfo({
            x: e.point.x,
            y: e.point.y,
            state: stateLabel,
            country: countryName || "Unknown country",
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
          const sourceId = (e as { sourceId?: string }).sourceId
          const message = e.error?.message ?? String(e.error ?? "unknown")
          // Per-source/tile errors are non-fatal: log and keep the map up. Only a
          // real style failure (no sourceId) shows the error screen.
          if (sourceId) {
            devError("[CentersChoroplethMap] source error:", sourceId, message)
            return
          }
          devError("[CentersChoroplethMap] Map error:", message)
          // Retries once silently, then shows the error state (useMapRecovery).
          handleFatalError(message)
        }}
      >
        <NavigationControl position="top-left" showCompass={true} showZoom={true} />
        <FullscreenControl position="top-left" />

        <DebugLocationSearch mapRef={mapRef} />

        <Source id="admin1" type="geojson" data="/data/admin-1.geojson">
          <Layer
            id="admin1-base-outline"
            type="line"
            filter={["==", ["get", "level"], 1]}
            paint={{
              "line-color": "#64748b",
              "line-width": 0.5,
              "line-opacity": 0.5,
            }}
          />
          <Layer
            id="admin1-fill"
            type="fill"
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
            filter={layerFilter}
            paint={{
              "line-color": "#ffffff",
              "line-width": 0.7,
              "line-opacity": 0.8,
            }}
          />
          <Layer
            id="admin1-hover-fill"
            type="fill"
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
          className="absolute bottom-4 left-4 z-10 min-w-[220px] rounded-lg border bg-card p-3 shadow-float"
          style={{
            fontFamily:
              "var(--font-sans), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div className="mb-2 text-xs font-medium text-muted-foreground">Total centres</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
            }}
          >
            <ChartTooltipCard
              variant="card"
              title={hoverInfo.state || "Unknown state"}
              subtitle={hoverInfo.country || "Unknown country"}
              lead={hoverInfo.count.toLocaleString("en-US")}
              leadUnit={hoverInfo.count === 1 ? "centre" : "centres"}
              lines={[
                { label: "Accounts", value: hoverInfo.accountsCount.toLocaleString("en-US") },
                { label: "Headcount", value: hoverInfo.headcount.toLocaleString("en-US") },
              ]}
            />
          </div>
        )}

      </MapGL>
    </div>
  )
}
