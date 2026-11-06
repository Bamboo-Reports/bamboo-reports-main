"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useControl, type ControlPosition } from "@vis.gl/react-maplibre"
import { RiFocus3Line } from "@remixicon/react"
import { HintTooltip } from "@/components/ui/tooltip"

interface RecenterControlProps {
  onRecenter: () => void
  position?: ControlPosition
}

/**
 * A "Recentre map" button in the map's own control stack (under zoom and
 * fullscreen), styled like the other MapLibre controls. The button is React,
 * rendered into the control's container, so it gets the app's label tooltip.
 */
export function RecenterControl({ onRecenter, position = "top-left" }: RecenterControlProps) {
  const [container] = useState(() => {
    const element = document.createElement("div")
    element.className = "maplibregl-ctrl maplibregl-ctrl-group"
    return element
  })

  useControl(
    () => ({
      onAdd: () => container,
      onRemove: () => container.remove(),
    }),
    { position }
  )

  return createPortal(
    <HintTooltip label="Recentre map" side="right">
      <button type="button" onClick={onRecenter} className="!flex items-center justify-center text-foreground/80">
        <RiFocus3Line className="h-4 w-4" aria-hidden />
      </button>
    </HintTooltip>,
    container
  )
}
