"use client"

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"

/** One toast for every record being opened, so a newer click replaces an older cue. */
export const RECORD_OPEN_TOAST_ID = "record-open"

// Cached records open within a frame; only show the loading cue past this.
const LOADING_TOAST_DELAY_MS = 250

interface OpenRecordOptions<T> {
  /** Shown as "Opening <label>…" while the record loads, e.g. "account". */
  label: string
  /** Fetches the record; null or undefined means it does not exist. */
  load: () => Promise<T | null | undefined>
  onLoaded: (record: T) => void
  notFoundMessage: string
  errorMessage: string
}

/**
 * Opens a record that has to be fetched first (search history, recent items,
 * related account links) with feedback (#290): a loading toast if the fetch is
 * slow, a "not found" toast when the record is missing, and an error toast on
 * failure. Only the latest call opens anything, so clicking two records
 * quickly opens the second even if the first answers later.
 */
export function useRecordOpener() {
  const latestRef = useRef(0)

  useEffect(
    () => () => {
      latestRef.current++
    },
    []
  )

  return useCallback(<T,>({ label, load, onLoaded, notFoundMessage, errorMessage }: OpenRecordOptions<T>) => {
    const id = ++latestRef.current
    const isLatest = () => latestRef.current === id
    const timer = setTimeout(() => {
      if (isLatest()) toast.loading(`Opening ${label}…`, { id: RECORD_OPEN_TOAST_ID })
    }, LOADING_TOAST_DELAY_MS)

    load()
      .then((record) => {
        clearTimeout(timer)
        if (!isLatest()) return
        if (record === null || record === undefined) {
          toast.info(notFoundMessage, { id: RECORD_OPEN_TOAST_ID })
          return
        }
        toast.dismiss(RECORD_OPEN_TOAST_ID)
        onLoaded(record)
      })
      .catch(() => {
        clearTimeout(timer)
        if (isLatest()) toast.info(errorMessage, { id: RECORD_OPEN_TOAST_ID })
      })
  }, [])
}
