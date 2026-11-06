"use client"

import type { DataLayout } from "@/components/tables/data-table"
import { choicePreference, usePersistedPreference } from "@/hooks/use-persisted-preference"

/** Table or Grid for the Data view, shared by the Accounts, Centres and Prospects tabs. */
export const DATA_LAYOUT_STORAGE_KEY = "br-data-layout"
/** Table or Grid for the centre and prospect lists inside a record window. */
export const RECORD_LIST_LAYOUT_STORAGE_KEY = "br-record-list-layout"

const DATA_LAYOUT_PREFERENCE = choicePreference<DataLayout>(["table", "grid"], "table")

/** Remembers Table or Grid per storage key; every user of the same key stays in step. */
export function useDataLayoutPreference(storageKey: string = DATA_LAYOUT_STORAGE_KEY) {
  return usePersistedPreference(storageKey, DATA_LAYOUT_PREFERENCE)
}
