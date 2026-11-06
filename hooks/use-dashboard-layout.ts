"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { PieChartLabelDisplay } from "@/components/charts/pie-chart-card"
import type { TabSort } from "@/components/tabs/accounts-tab"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import type { EntitySort } from "@/lib/dashboard/api-client"
import { TAB_SORT_COLUMNS } from "@/lib/dashboard/entity-columns"
import { DEFAULT_PAGE_SIZE, isPageSizeOption } from "@/lib/dashboard/page-size"

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "br-dashboard-sidebar-collapsed"
export const PAGE_SIZE_STORAGE_KEY = "br-dashboard-page-size"

export type DashboardSection = "accounts" | "centers" | "prospects"
export type EntityView = "chart" | "data" | "map"
export type ProspectsView = "chart" | "data"

export const DEFAULT_SECTION: DashboardSection = "accounts"

// The page size is read straight from storage (through useSyncExternalStore,
// so the server render and hydration still see the default) instead of being
// restored in a mount effect: a mount effect would let the active table fetch
// its first page at the default size and then again at the saved one.
const pageSizeListeners = new Set<() => void>()
// Only used when storage cannot be written to, so the chosen size still applies.
let unsavedPageSize: number | null = null

function readPageSize(): number {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    if (isPageSizeOption(stored)) return stored
  } catch {
    // storage unavailable (private mode, blocked site data)
  }
  return unsavedPageSize ?? DEFAULT_PAGE_SIZE
}

function subscribePageSize(listener: () => void) {
  pageSizeListeners.add(listener)
  return () => {
    pageSizeListeners.delete(listener)
  }
}

function storePageSize(size: number) {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size))
    unsavedPageSize = null
  } catch {
    unsavedPageSize = size
  }
  pageSizeListeners.forEach((listener) => listener())
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
  const itemsPerPage = useSyncExternalStore(subscribePageSize, readPageSize, () => DEFAULT_PAGE_SIZE)
  // One page size for all three tables; a new size starts every tab from page 1.
  const setItemsPerPage = useCallback((size: number) => {
    setAccountsPage(1)
    setCentersPage(1)
    setProspectsPage(1)
    storePageSize(size)
  }, [])

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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const sidebarCollapsedRef = useRef(false)

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

  useEffect(() => {
    const storedSidebarState = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    if (storedSidebarState === "true") {
      sidebarCollapsedRef.current = true
      setIsSidebarCollapsed(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  // Reported from the toggle itself, so restoring the saved state on load is
  // not counted as a toggle.
  const toggleSidebar = useCallback(() => {
    const next = !sidebarCollapsedRef.current
    sidebarCollapsedRef.current = next
    setIsSidebarCollapsed(next)
    captureEvent(ANALYTICS_EVENTS.SIDEBAR_TOGGLED, { is_collapsed: next })
  }, [])

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
    isSidebarCollapsed,
    toggleSidebar,
  }
}

export type DashboardLayout = ReturnType<typeof useDashboardLayout>
