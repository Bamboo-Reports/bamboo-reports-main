import type { DriveStep } from "driver.js"

function getVisibleTourElement(selector: string): Element | null {
  if (typeof document === "undefined") {
    return null
  }

  const elements = Array.from(document.querySelectorAll(selector))

  return (
    elements.find((element) => {
      const htmlElement = element as HTMLElement
      const style = window.getComputedStyle(htmlElement)

      return (
        !htmlElement.hidden &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        htmlElement.getClientRects().length > 0
      )
    }) ?? null
  )
}

export function getDashboardTourSteps(options: { hasMapView: boolean; isSidebarCollapsed: boolean }): DriveStep[] {
  const steps: DriveStep[] = []
  const addStep = (selector: string, step: Omit<DriveStep, "element">) => {
    const element = getVisibleTourElement(selector)
    if (!element) {
      return
    }

    steps.push({
      element,
      ...step,
    })
  }

  addStep("[data-tour='summary-cards']", {
    popover: {
      title: "Your Dashboard at a Glance",
      description:
        "These cards show total Accounts, Centers, Prospects, and Headcount. Click any card to jump to that section. Filtered counts update in real time.",
      side: "bottom",
      align: "center",
    },
  })

  addStep("[data-tour='tab-navigation']", {
    popover: {
      title: "Switch Between Sections",
      description:
        "Navigate between Accounts, Centers, and Prospects. Each section has its own charts, tables, and maps.",
      side: "bottom",
      align: "start",
    },
  })

  addStep("[data-tour='view-switcher']", {
    popover: {
      title: "Choose Your View",
      description:
        "Toggle between Chart, Data table, and Map views. Each perspective reveals different insights about the same data.",
      side: "bottom",
      align: "start",
    },
  })

  addStep("[data-tour='filters-sidebar']", {
    popover: {
      title: "Powerful Filtering",
      description: options.isSidebarCollapsed
        ? "Your filters live here. Expand the sidebar to manage filter groups, saved views, and export actions."
        : "Use the filter sidebar to slice data by region, industry, revenue, headcount, and more. Filters apply across all sections simultaneously.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='saved-filters']", {
    popover: {
      title: "Save & Share Filters",
      description:
        "Save your filter combinations for quick access later. Share them with teammates so everyone works from the same view.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='export-button']", {
    popover: {
      title: "Export to Excel",
      description:
        "Download filtered data as a multi-sheet Excel workbook. Choose which datasets to include.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='header-actions']", {
    popover: {
      title: "Quick Actions",
      description:
        "Refresh data, check notifications for recent changes, toggle dark mode, and manage your account.",
      side: "bottom",
      align: "end",
    },
  })

  if (options.hasMapView) {
    addStep("[data-tour='map-view']", {
      popover: {
        title: "Geospatial Intelligence",
        description:
          "Cluster and choropleth maps show geographic distribution. Zoom, pan, and click markers for details.",
        side: "left",
        align: "center",
      },
    })
  }

  steps.push({
    popover: {
      title: "You're All Set!",
      description:
        "That covers the essentials. You can replay this tour anytime from your profile menu. Happy exploring!",
    },
  })

  return steps
}
