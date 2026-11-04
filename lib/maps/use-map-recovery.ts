"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { isWorkerLoadError, preloadMapWorker } from "@/lib/maps/basemap"

const AUTO_RETRY_DELAY_MS = 1000

export type MapErrorKind = "worker" | "map"

/**
 * Keeps a map alive through brief failures.
 *
 * - Before the map mounts, `ready` waits for the worker file to be downloaded
 *   and cached (preloadMapWorker), the usual cause of "Worker failed to load".
 * - A worker failure goes straight to the error state with a page reload,
 *   because MapLibre reuses its workers for the whole page and a remount
 *   would get the same broken ones.
 * - Any other fatal error (style or source failure) remounts the map once,
 *   silently, after a short pause. A second failure shows the error state
 *   with "Reload map". A successful load re-arms the silent retry.
 *
 * Pass `mapKey` as the map component's `key`: changing it builds a fresh map.
 */
export function useMapRecovery({ map_kind, map_name }: { map_kind: string; map_name: string }) {
  const [mapKey, setMapKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<MapErrorKind>("map")
  const [ready, setReady] = useState(false)
  const autoRetried = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
  }, [])

  useEffect(() => {
    let active = true
    preloadMapWorker().then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  const handleFatalError = useCallback((message: string) => {
    if (isWorkerLoadError(message)) {
      setErrorKind("worker")
      setError(message)
      captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, { map_kind, map_name, error_message: message, recovery: "page_reload" })
      return
    }
    if (!autoRetried.current) {
      autoRetried.current = true
      captureEvent(ANALYTICS_EVENTS.MAP_ERROR_AUTO_RETRIED, { map_kind, map_name, error_message: message })
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => setMapKey((key) => key + 1), AUTO_RETRY_DELAY_MS)
      return
    }
    setErrorKind("map")
    setError(message)
    captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, { map_kind, map_name, error_message: message, recovery: "map_reload" })
  }, [map_kind, map_name])

  const handleLoad = useCallback(() => {
    autoRetried.current = false
  }, [])

  const reload = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.MAP_RELOAD_CLICKED, { map_kind, map_name, recovery: errorKind === "worker" ? "page_reload" : "map_reload" })
    if (errorKind === "worker") {
      window.location.reload()
      return
    }
    setError(null)
    setMapKey((key) => key + 1)
  }, [map_kind, map_name, errorKind])

  return { mapKey, ready, error, errorKind, handleFatalError, handleLoad, reload }
}
