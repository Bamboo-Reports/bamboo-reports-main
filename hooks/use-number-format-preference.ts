"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * How summary figures are written:
 * auto = full when the card has room, shortened (K, M) when it does not.
 * full = always 486,120. short = always 486K.
 */
export type NumberFormatPreference = "auto" | "full" | "short"

export const NUMBER_FORMAT_STORAGE_KEY = "br-number-format"
const DEFAULT_PREFERENCE: NumberFormatPreference = "auto"

const listeners = new Set<() => void>()

function isPreference(value: unknown): value is NumberFormatPreference {
  return value === "auto" || value === "full" || value === "short"
}

function readPreference(): NumberFormatPreference {
  try {
    const stored = window.localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY)
    return isPreference(stored) ? stored : DEFAULT_PREFERENCE
  } catch {
    return DEFAULT_PREFERENCE
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Other tabs write through the storage event; this tab notifies directly.
  const onStorage = (event: StorageEvent) => {
    if (event.key === NUMBER_FORMAT_STORAGE_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useNumberFormatPreference() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => DEFAULT_PREFERENCE)

  const setPreference = useCallback((next: NumberFormatPreference) => {
    try {
      window.localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, next)
    } catch {
      // storage unavailable (private mode, quota): nothing to persist to
    }
    listeners.forEach((listener) => listener())
  }, [])

  return [preference, setPreference] as const
}
