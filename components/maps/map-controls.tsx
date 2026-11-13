"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useControl, useMap, type ControlPosition } from "@vis.gl/react-maplibre"
import {
  RiAddLine,
  RiCompass3Line,
  RiFocus3Line,
  RiFullscreenExitLine,
  RiFullscreenLine,
  RiSubtractLine,
} from "@remixicon/react"
import { HintTooltip } from "@/components/ui/tooltip"

interface MapControlsProps {
  onRecenter: () => void
  position?: ControlPosition
}

/**
 * The map's control stack: zoom in and out, reset north, fullscreen and
 * recentre, in one group styled like MapLibre's controls. These replace
 * MapLibre's NavigationControl and FullscreenControl, whose buttons carry
 * native title tooltips; here each button gets the app's label tooltip.
 */
export function MapControls({ onRecenter, position = "top-left" }: MapControlsProps) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap()
  const [container] = useState(() => {
    const element = document.createElement("div")
    element.className = "maplibregl-ctrl maplibregl-ctrl-group"
    return element
  })
  const [bearing, setBearing] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useControl(
    () => ({
      onAdd: () => container,
      onRemove: () => container.remove(),
    }),
    { position }
  )

  useEffect(() => {
    if (!map) return
    const updateBearing = () => setBearing(map.getBearing())
    updateBearing()
    map.on("rotate", updateBearing)
    // The attribution toggle is required by the map data licence and stays,
    // without its native title tooltip (its aria-label already names it).
    const stripAttributionTitle = () => {
      map.getContainer().querySelector(".maplibregl-ctrl-attrib-button")?.removeAttribute("title")
    }
    stripAttributionTitle()
    map.on("load", stripAttributionTitle)
    return () => {
      map.off("rotate", updateBearing)
      map.off("load", stripAttributionTitle)
    }
  }, [map])

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(map && document.fullscreenElement === map.getContainer()))
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [map])

  const toggleFullscreen = () => {
    if (!map) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void map.getContainer().requestFullscreen?.()
    }
  }

  // The app's hover, focus ring and press feedback replace MapLibre's stock
  // near-invisible hover tint and blue focus glow.
  const buttonClass =
    "!flex items-center justify-center text-foreground/80 transition-colors duration-150 hover:!bg-muted focus-visible:!shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-90"

  return createPortal(
    <>
      <HintTooltip label="Zoom in" side="right">
        <button type="button" className={buttonClass} onClick={() => map?.zoomIn()}>
          <RiAddLine className="h-4 w-4" aria-hidden />
        </button>
      </HintTooltip>
      <HintTooltip label="Zoom out" side="right">
        <button type="button" className={buttonClass} onClick={() => map?.zoomOut()}>
          <RiSubtractLine className="h-4 w-4" aria-hidden />
        </button>
      </HintTooltip>
      <HintTooltip label="Reset north" side="right">
        <button type="button" className={buttonClass} onClick={() => map?.resetNorthPitch()}>
          {/* Turns with the map, like MapLibre's compass. */}
          <RiCompass3Line
            className="h-4 w-4 transition-transform duration-150 motion-reduce:transition-none"
            style={{ transform: `rotate(${-bearing}deg)` }}
            aria-hidden
          />
        </button>
      </HintTooltip>
      <HintTooltip label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} side="right">
        <button type="button" className={buttonClass} onClick={toggleFullscreen}>
          {isFullscreen ? (
            <RiFullscreenExitLine className="h-4 w-4" aria-hidden />
          ) : (
            <RiFullscreenLine className="h-4 w-4" aria-hidden />
          )}
        </button>
      </HintTooltip>
      <HintTooltip label="Recentre map" side="right">
        <button type="button" className={buttonClass} onClick={onRecenter}>
          <RiFocus3Line className="h-4 w-4" aria-hidden />
        </button>
      </HintTooltip>
    </>,
    container
  )
}
