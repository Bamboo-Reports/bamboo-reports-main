"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { DataLayout } from "@/components/tables/data-table"

/** Table or Grid for the Data view, shared by the Accounts, Centres and Prospects tabs. */
export const DATA_LAYOUT_STORAGE_KEY = "br-data-layout"
/** Table or Grid for the centre and prospect lists inside a record window. */
export const RECORD_LIST_LAYOUT_STORAGE_KEY = "br-record-list-layout"
const DEFAULT_LAYOUT: DataLayout = "table"

const listeners = new Map<string, Set<() => void>>()

function isLayout(value: unknown): value is DataLayout {
  return value === "table" || value === "grid"
}

function readLayout(key: string): DataLayout {
  try {
    const stored = window.localStorage.getItem(key)
    return isLayout(stored) ? stored : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

function listenersFor(key: string): Set<() => void> {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  return set
}

/** Remembers Table or Grid per storage key; every user of the same key stays in step. */
export function useDataLayoutPreference(storageKey: string = DATA_LAYOUT_STORAGE_KEY) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listenersFor(storageKey)
      set.add(listener)
      // Other tabs write through the storage event; this tab notifies directly.
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) listener()
      }
      window.addEventListener("storage", onStorage)
      return () => {
        set.delete(listener)
        window.removeEventListener("storage", onStorage)
      }
    },
    [storageKey]
  )
  const getSnapshot = useCallback(() => readLayout(storageKey), [storageKey])
  const layout = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LAYOUT)

  const setLayout = useCallback(
    (next: DataLayout) => {
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        // storage unavailable (private mode, quota): nothing to persist to
      }
      listenersFor(storageKey).forEach((listener) => listener())
    },
    [storageKey]
  )

  return [layout, setLayout] as const
}
