"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { DataLayout } from "@/components/tables/data-table"

/** Table or Grid for the Data view, shared by the Accounts, Centres and Prospects tabs. */
export const DATA_LAYOUT_STORAGE_KEY = "br-data-layout"
const DEFAULT_LAYOUT: DataLayout = "table"

const listeners = new Set<() => void>()

function isLayout(value: unknown): value is DataLayout {
  return value === "table" || value === "grid"
}

function readLayout(): DataLayout {
  try {
    const stored = window.localStorage.getItem(DATA_LAYOUT_STORAGE_KEY)
    return isLayout(stored) ? stored : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Other tabs write through the storage event; this tab notifies directly.
  const onStorage = (event: StorageEvent) => {
    if (event.key === DATA_LAYOUT_STORAGE_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useDataLayoutPreference() {
  const layout = useSyncExternalStore(subscribe, readLayout, () => DEFAULT_LAYOUT)

  const setLayout = useCallback((next: DataLayout) => {
    try {
      window.localStorage.setItem(DATA_LAYOUT_STORAGE_KEY, next)
    } catch {
      // storage unavailable (private mode, quota): nothing to persist to
    }
    listeners.forEach((listener) => listener())
  }, [])

  return [layout, setLayout] as const
}
