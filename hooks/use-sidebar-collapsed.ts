"use client"

import { useCallback } from "react"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { BOOLEAN_PREFERENCE, readPreference, usePersistedPreference } from "@/hooks/use-persisted-preference"

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "br-dashboard-sidebar-collapsed"

/**
 * Whether the filters sidebar is collapsed, remembered per browser. Only the
 * sidebar subscribes: keeping this out of the dashboard page means a toggle
 * re-renders the sidebar alone, not every tab, chart and dialog with it.
 */
export function useSidebarCollapsed() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistedPreference(SIDEBAR_COLLAPSED_STORAGE_KEY, BOOLEAN_PREFERENCE)

  // Reported from the toggle itself, so the saved state on load is not counted as a toggle.
  const toggleSidebar = useCallback(() => {
    const next = !isSidebarCollapsed
    setIsSidebarCollapsed(next)
    captureEvent(ANALYTICS_EVENTS.SIDEBAR_TOGGLED, { is_collapsed: next })
  }, [isSidebarCollapsed, setIsSidebarCollapsed])

  return { isSidebarCollapsed, toggleSidebar }
}

/** The sidebar state at this moment, for code that runs outside render. */
export function readSidebarCollapsed(): boolean {
  return readPreference(SIDEBAR_COLLAPSED_STORAGE_KEY, BOOLEAN_PREFERENCE)
}
