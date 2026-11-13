"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { PieChartLabelDisplay } from "@/components/charts/pie-chart-card"
import type { TabSort } from "@/components/tabs/accounts-tab"
import type { EntitySort } from "@/lib/dashboard/api-client"
import { TAB_SORT_COLUMNS } from "@/lib/dashboard/entity-columns"
import { DEFAULT_PAGE_SIZE, isPageSizeOption } from "@/lib/dashboard/page-size"
import { usePersistedPreference, type PreferenceCodec } from "@/hooks/use-persisted-preference"

export const PAGE_SIZE_STORAGE_KEY = "br-dashboard-page-size"

export type DashboardSection = "accounts" | "centers" | "prospects"
export type EntityView = "chart" | "data" | "map"
export type ProspectsView = "chart" | "data"

export const DEFAULT_SECTION: DashboardSection = "accounts"

// Read straight from storage on the first render (not restored in a mount
// effect), so the active table's first page query already uses the saved size.
const PAGE_SIZE_PREFERENCE: PreferenceCodec<number> = {
  parse: (raw) => {
    const size = Number(raw)
    return isPageSizeOption(size) ? size : DEFAULT_PAGE_SIZE
  },
  serialize: String,
}

function toEntitySort(entity: DashboardSection, sort: TabSort | null): EntitySort | null {
  const column = sort ? TAB_SORT_COLUMNS[entity][sort.key] : undefined
  return sort && column ? { column, direction: sort.direction } : null
}

/**
 * What the dashboard is showing: the section, each section's view, page and
 * sort, the shared page size, chart labels and the sidebar. Page size and the
 * sidebar are remembered per browser. Pages go back to 1 whenever
 * `filtersKey` changes.
 */
export function useDashboardLayout({ filtersKey }: { filtersKey: string }) {
  const [activeSection, setActiveSection] = useState<DashboardSection>(DEFAULT_SECTION)
  const [accountsView, setAccountsView] = useState<EntityView>("map")
  const [centersView, setCentersView] = useState<EntityView>("map")
  const [prospectsView, setProspectsView] = useState<ProspectsView>("chart")
  const [chartLabelDisplay, setChartLabelDisplay] = useState<PieChartLabelDisplay>({
    showCategoryLabels: true,
    showPercentages: true,
  })

  const [accountsPage, setAccountsPage] = useState(1)
  const [centersPage, setCentersPage] = useState(1)
  const [prospectsPage, setProspectsPage] = useState(1)
  const [itemsPerPage, storeItemsPerPage] = usePersistedPreference(PAGE_SIZE_STORAGE_KEY, PAGE_SIZE_PREFERENCE)
  // One page size for all three tables; a new size starts every tab from page 1.
  const setItemsPerPage = useCallback(
    (size: number) => {
      setAccountsPage(1)
      setCentersPage(1)
      setProspectsPage(1)
      storeItemsPerPage(size)
    },
    [storeItemsPerPage]
  )

  // Server mode: per-entity sort state, keyed by the tab's column id. The
  // tables read it back through their server props, so this is the only copy.
  const [accountsSort, setAccountsSort] = useState<TabSort | null>(null)
  const [centersSort, setCentersSort] = useState<TabSort | null>(null)
  const [prospectsSort, setProspectsSort] = useState<TabSort | null>(null)
  const entitySorts = useMemo(
    () => ({
      accounts: toEntitySort("accounts", accountsSort),
      centers: toEntitySort("centers", centersSort),
      prospects: toEntitySort("prospects", prospectsSort),
    }),
    [accountsSort, centersSort, prospectsSort]
  )

  const activeView: EntityView | ProspectsView =
    activeSection === "accounts" ? accountsView : activeSection === "centers" ? centersView : prospectsView
  const activePage =
    activeSection === "accounts" ? accountsPage : activeSection === "centers" ? centersPage : prospectsPage
  const hasMapView =
    (activeSection === "accounts" && accountsView === "map") ||
    (activeSection === "centers" && centersView === "map")

  useEffect(() => {
    setAccountsPage(1)
    setCentersPage(1)
    setProspectsPage(1)
  }, [filtersKey])

  return {
    activeSection,
    setActiveSection,
    accountsView,
    setAccountsView,
    centersView,
    setCentersView,
    prospectsView,
    setProspectsView,
    activeView,
    hasMapView,
    chartLabelDisplay,
    setChartLabelDisplay,
    accountsPage,
    setAccountsPage,
    centersPage,
    setCentersPage,
    prospectsPage,
    setProspectsPage,
    activePage,
    itemsPerPage,
    setItemsPerPage,
    accountsSort,
    setAccountsSort,
    centersSort,
    setCentersSort,
    prospectsSort,
    setProspectsSort,
    entitySorts,
  }
}

export type DashboardLayout = ReturnType<typeof useDashboardLayout>
