"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { RecentItem } from "@/hooks/use-recent-items"

export type RecordHistoryItem = Omit<RecentItem, "viewedAt">

type RecordOpened = (item: RecordHistoryItem) => void

const noop: RecordOpened = () => {}

const RecordHistoryContext = createContext<RecordOpened>(noop)

/**
 * Supplies the History writer (useRecentItems' addRecentItem) to the detail
 * dialogs, so every record a dialog shows is recorded, including records
 * opened from inside another dialog (#310).
 */
export function RecordHistoryProvider({ recordOpened, children }: { recordOpened: RecordOpened; children: ReactNode }) {
  return <RecordHistoryContext.Provider value={recordOpened}>{children}</RecordHistoryContext.Provider>
}

/** Records a record in History; a no-op outside a RecordHistoryProvider. */
export function useRecordHistory(): RecordOpened {
  return useContext(RecordHistoryContext)
}
