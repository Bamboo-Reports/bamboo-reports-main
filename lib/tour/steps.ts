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
      title: "The dashboard at a glance",
      description:
        "Each card shows how many accounts, centres, prospects and employees match your filters, out of the total. Click Accounts, Centres or Prospects to open that section.",
      side: "bottom",
      align: "center",
    },
  })

  addStep("[data-tour='tab-navigation']", {
    popover: {
      title: "Sections",
      description:
        "Accounts, Centres and Prospects each have their own charts and data view. Accounts and Centres also have a map.",
      side: "bottom",
      align: "start",
    },
  })

  addStep("[data-tour='view-switcher']", {
    popover: {
      title: "Charts, map or data",
      description:
        "Switch how a section is shown: charts for the breakdown, the map for where centres are, and the data view for the full list.",
      side: "bottom",
      align: "start",
    },
  })

  addStep("[data-tour='filters-sidebar']", {
    popover: {
      title: "Filters",
      description: options.isSidebarCollapsed
        ? "Your filters live here. Expand the panel to set filters, load saved ones and export."
        : "Narrow the data by region, industry, revenue, headcount and more. Filters apply to every section at once.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='saved-filters']", {
    popover: {
      title: "Save and share filters",
      description:
        "Save a set of filters to apply it again in one click, or share it with teammates so everyone works from the same view.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='export-button']", {
    popover: {
      title: "Export to Excel",
      description: "Download the filtered data as an Excel workbook, with a sheet for each dataset you pick.",
      side: "right",
      align: "start",
    },
  })

  addStep("[data-tour='header-actions']", {
    popover: {
      title: "Search, refresh and updates",
      description:
        "Search everything with Ctrl K, refresh the data, and open Updates (the bell) for recent changes. Your account and theme live at the bottom of the filters panel.",
      side: "bottom",
      align: "end",
    },
  })

  if (options.hasMapView) {
    addStep("[data-tour='map-view']", {
      popover: {
        title: "Map",
        description: "See where centres are, by city or by state. Zoom, pan and hover a state or city for details.",
        side: "left",
        align: "center",
      },
    })
  }

  steps.push({
    popover: {
      title: "That's the tour",
      description: "You can replay it any time from your profile menu.",
    },
  })

  return steps
}

/**
 * Step titles as analytics has always recorded them (TOUR_STEP_VIEWED
 * step_title), so tour reports stay comparable after the on-screen titles
 * changed. Step indexes shift when the map step is skipped, so the title is
 * the stable key.
 */
const ANALYTICS_STEP_TITLES: Record<string, string> = {
  "The dashboard at a glance": "Your Dashboard at a Glance",
  Sections: "Switch Between Sections",
  "Charts, map or data": "Choose Your View",
  Filters: "Powerful Filtering",
  "Save and share filters": "Save & Share Filters",
  "Export to Excel": "Export to Excel",
  "Search, refresh and updates": "Quick Actions",
  Map: "Geospatial Intelligence",
  "That's the tour": "You're All Set!",
}

export function getAnalyticsStepTitle(title: string | undefined): string | undefined {
  return title ? ANALYTICS_STEP_TITLES[title] ?? title : title
}
