"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * How a preference is stored: `parse` turns the stored string (or null when
 * nothing is stored or storage is unreadable) into a value, and must give the
 * default for anything it does not recognise; `serialize` is the reverse.
 * Codecs are module-level constants, and `parse` returns primitives (or cached
 * objects), because the value is compared by identity on every render.
 */
export interface PreferenceCodec<T> {
  parse: (raw: string | null) => T
  serialize: (value: T) => string
}

const listeners = new Map<string, Set<() => void>>()
// Values whose write failed (storage blocked or full), so the choice still applies in this tab.
const unsaved = new Map<string, string>()

function listenersFor(key: string): Set<() => void> {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  return set
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? unsaved.get(key) ?? null
  } catch {
    return unsaved.get(key) ?? null
  }
}

function writeRaw(key: string, raw: string) {
  try {
    window.localStorage.setItem(key, raw)
    unsaved.delete(key)
  } catch {
    unsaved.set(key, raw)
  }
  listenersFor(key).forEach((listener) => listener())
}

/**
 * Calls `listener` when the preference changes, in this tab or another. For code
 * outside render that must react to a change without re-rendering on every one.
 */
export function subscribePreference(key: string, listener: () => void): () => void {
  const set = listenersFor(key)
  set.add(listener)
  // Other tabs write through the storage event; this tab notifies directly.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    set.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** The current value, read outside render (event handlers, effects). */
export function readPreference<T>(key: string, codec: PreferenceCodec<T>): T {
  return codec.parse(readRaw(key))
}

/**
 * A per-browser preference in localStorage, read through useSyncExternalStore
 * so the first render already has it (the server render and hydration see the
 * default) and every component using the same key stays in step, in this tab
 * and in others. Storage that cannot be read or written never throws: the
 * default applies, and a choice made in the meantime still holds for the tab.
 */
export function usePersistedPreference<T>(key: string, codec: PreferenceCodec<T>): [T, (next: T) => void] {
  const subscribe = useCallback((listener: () => void) => subscribePreference(key, listener), [key])
  const getSnapshot = useCallback(() => codec.parse(readRaw(key)), [key, codec])
  const getServerSnapshot = useCallback(() => codec.parse(null), [codec])
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setValue = useCallback((next: T) => writeRaw(key, codec.serialize(next)), [key, codec])
  return [value, setValue]
}

/** "true" or "false"; anything else is false. */
export const BOOLEAN_PREFERENCE: PreferenceCodec<boolean> = {
  parse: (raw) => raw === "true",
  serialize: String,
}

/** One of a fixed set of strings, with a fallback for anything else. */
export function choicePreference<T extends string>(options: readonly T[], fallback: T): PreferenceCodec<T> {
  return {
    parse: (raw) => ((options as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback),
    serialize: (value) => value,
  }
}
