"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { isWorkerLoadError, preloadMapWorker } from "@/lib/maps/basemap"

const AUTO_RETRY_DELAY_MS = 1000
// A map must stay up this long after loading before a later failure gets a
// fresh silent retry. Without it, an error that always follows a load would
// remount the map forever.
export const STABLE_AFTER_LOAD_MS = 10_000

export type MapErrorKind = "worker" | "map"

/**
 * Keeps a map alive through brief failures.
 *
 * - Before the map mounts, `ready` waits for the worker file to be downloaded
 *   and cached (preloadMapWorker), the usual cause of "Worker failed to load".
 * - A worker failure before any map has loaded means the worker file never
 *   arrived. MapLibre reuses its workers for the whole page, so a remount would
 *   get the same broken ones: go straight to the error state with a page reload.
 *   After a load the workers are known to work, so the same message is a crash
 *   inside a worker and is handled like any other map error.
 * - Any other fatal error remounts the map once, silently, after a short pause.
 *   A further failure shows the error state with "Reload map". The silent retry
 *   is re-armed only once a load has stayed up for STABLE_AFTER_LOAD_MS.
 * - Errors that arrive while a retry is pending or the error is already shown
 *   are ignored. MapLibre sends the worker message once per worker, and one
 *   failure often raises several events.
 *
 * Pass `mapKey` as the map component's `key`: changing it builds a fresh map.
 */
export function useMapRecovery({ map_kind, map_name }: { map_kind: string; map_name: string }) {
  const [mapKey, setMapKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<MapErrorKind>("map")
  const [ready, setReady] = useState(false)
  const autoRetried = useRef(false)
  const errorShown = useRef(false)
  const hasLoaded = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    if (stableTimer.current) clearTimeout(stableTimer.current)
    retryTimer.current = null
    stableTimer.current = null
  }, [])

  useEffect(() => clearTimers, [clearTimers])

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
    if (errorShown.current || retryTimer.current) return
    // The map that just failed is not stable, so it must not re-arm the retry.
    if (stableTimer.current) clearTimeout(stableTimer.current)
    stableTimer.current = null

    if (isWorkerLoadError(message) && !hasLoaded.current) {
      errorShown.current = true
      setErrorKind("worker")
      setError(message)
      captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, { map_kind, map_name, error_message: message, recovery: "page_reload" })
      return
    }
    if (!autoRetried.current) {
      autoRetried.current = true
      captureEvent(ANALYTICS_EVENTS.MAP_ERROR_AUTO_RETRIED, { map_kind, map_name, error_message: message })
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null
        setMapKey((key) => key + 1)
      }, AUTO_RETRY_DELAY_MS)
      return
    }
    errorShown.current = true
    setErrorKind("map")
    setError(message)
    captureEvent(ANALYTICS_EVENTS.MAP_ERROR_SHOWN, { map_kind, map_name, error_message: message, recovery: "map_reload" })
  }, [map_kind, map_name])

  const handleLoad = useCallback(() => {
    hasLoaded.current = true
    if (stableTimer.current) clearTimeout(stableTimer.current)
    stableTimer.current = setTimeout(() => {
      stableTimer.current = null
      autoRetried.current = false
    }, STABLE_AFTER_LOAD_MS)
  }, [])

  const reload = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.MAP_RELOAD_CLICKED, { map_kind, map_name, recovery: errorKind === "worker" ? "page_reload" : "map_reload" })
    if (errorKind === "worker") {
      window.location.reload()
      return
    }
    clearTimers()
    errorShown.current = false
    setError(null)
    setMapKey((key) => key + 1)
  }, [map_kind, map_name, errorKind, clearTimers])

  return { mapKey, ready, error, errorKind, handleFatalError, handleLoad, reload }
}
