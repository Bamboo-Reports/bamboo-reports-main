"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  getTableColumnStorageKey,
  TABLE_COLUMNS,
  type TableColumnKeyByDataset,
  type TableDatasetKey,
} from "@/lib/dashboard/table-column-preferences"

export function useTableColumnPreferences<Dataset extends TableDatasetKey>(dataset: Dataset) {
  type ColumnKey = TableColumnKeyByDataset[Dataset]

  const columns = TABLE_COLUMNS[dataset]
  const defaultVisibleColumns = useMemo(
    () => columns.map((column) => column.key as ColumnKey),
    [columns]
  )
  const requiredColumns = useMemo(
    () => new Set(columns.filter((column) => "required" in column && column.required).map((column) => column.key as ColumnKey)),
    [columns]
  )
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const stored = window.localStorage.getItem(getTableColumnStorageKey(dataset))
    if (!stored) {
      setVisibleColumns(defaultVisibleColumns)
      return
    }

    try {
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) {
        setVisibleColumns(defaultVisibleColumns)
        return
      }

      const validKeys = new Set(defaultVisibleColumns)
      const next = parsed.filter((key): key is ColumnKey => validKeys.has(key))
      for (const requiredKey of requiredColumns) {
        if (!next.includes(requiredKey)) {
          next.unshift(requiredKey)
        }
      }

      setVisibleColumns(next.length > 0 ? next : defaultVisibleColumns)
    } catch {
      setVisibleColumns(defaultVisibleColumns)
    }
  }, [dataset, defaultVisibleColumns, requiredColumns])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(getTableColumnStorageKey(dataset), JSON.stringify(visibleColumns))
  }, [dataset, visibleColumns])

  const visibleColumnSet = useMemo(() => new Set<ColumnKey>(visibleColumns), [visibleColumns])

  const isColumnVisible = useCallback(
    (column: ColumnKey) => visibleColumnSet.has(column),
    [visibleColumnSet]
  )

  const setColumnVisible = useCallback(
    (column: ColumnKey, visible: boolean) => {
      if (requiredColumns.has(column)) {
        return
      }

      setVisibleColumns((current) => {
        if (visible) {
          const next = columns
            .map((definition) => definition.key as ColumnKey)
            .filter((key) => key === column || current.includes(key))
          captureEvent(ANALYTICS_EVENTS.TABLE_COLUMN_VISIBILITY_CHANGED, {
            dataset,
            column,
            is_visible: true,
            visible_columns: next,
          })
          return next
        }

        const next = current.filter((key) => key !== column)
        captureEvent(ANALYTICS_EVENTS.TABLE_COLUMN_VISIBILITY_CHANGED, {
          dataset,
          column,
          is_visible: false,
          visible_columns: next,
        })
        return next
      })
    },
    [columns, dataset, requiredColumns]
  )

  const resetColumns = useCallback(() => {
    setVisibleColumns(defaultVisibleColumns)
    captureEvent(ANALYTICS_EVENTS.TABLE_COLUMNS_RESET, {
      dataset,
      visible_columns: defaultVisibleColumns,
    })
  }, [dataset, defaultVisibleColumns])

  return {
    columns,
    visibleColumns,
    visibleColumnSet,
    isColumnVisible,
    setColumnVisible,
    resetColumns,
  }
}
