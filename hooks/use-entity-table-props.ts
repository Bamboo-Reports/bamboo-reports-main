"use client"

import { useMemo } from "react"
import type { TabSort } from "@/components/tabs/accounts-tab"
import { TAB_SORT_COLUMNS } from "@/lib/dashboard/entity-columns"
import type { DashboardLayout, DashboardSection } from "@/hooks/use-dashboard-layout"
import type { ServerDashboardData } from "@/hooks/use-server-dashboard-data"

export type EntityServerProps = {
  total: number
  loading: boolean
  refreshing: boolean
  sort: TabSort | null
  onSortChange: (key: string, direction: "asc" | "desc" | null) => void
  selectionResetKey: string
}

/** A sort handler that ignores columns the server cannot sort by. */
export function makeSortHandler(entity: DashboardSection, set: (sort: TabSort | null) => void) {
  return (key: string, direction: "asc" | "desc" | null) => {
    set(direction && TAB_SORT_COLUMNS[entity][key] ? { key, direction } : null)
  }
}

function useEntityServerProps(
  entity: DashboardSection,
  serverData: ServerDashboardData,
  sort: TabSort | null,
  setSort: (sort: TabSort | null) => void,
  selectionResetKey: string
): EntityServerProps {
  const page = serverData.entityPages[entity]
  const pending = serverData.pending[entity]
  return useMemo(
    () => ({
      total: page?.total ?? 0,
      loading: page === null,
      refreshing: page !== null && pending,
      sort,
      onSortChange: makeSortHandler(entity, setSort),
      selectionResetKey,
    }),
    [entity, page, pending, sort, setSort, selectionResetKey]
  )
}

/**
 * The `server` props each table tab reads: totals, loading flags and sort
 * state. Row selections reset when `filtersKey` changes.
 */
export function useEntityTableProps(serverData: ServerDashboardData, layout: DashboardLayout, filtersKey: string) {
  const accounts = useEntityServerProps("accounts", serverData, layout.accountsSort, layout.setAccountsSort, filtersKey)
  const centers = useEntityServerProps("centers", serverData, layout.centersSort, layout.setCentersSort, filtersKey)
  const prospects = useEntityServerProps("prospects", serverData, layout.prospectsSort, layout.setProspectsSort, filtersKey)
  return { accounts, centers, prospects }
}
