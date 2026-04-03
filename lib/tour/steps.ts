import type { DriveStep } from "driver.js"

export function getDashboardTourSteps(options: { hasMapView: boolean }): DriveStep[] {
  const steps: DriveStep[] = [
    {
      element: "[data-tour='summary-cards']",
      popover: {
        title: "Your Dashboard at a Glance",
        description:
          "These cards show total Accounts, Centers, Prospects, and Headcount. Click any card to jump to that section. Filtered counts update in real time.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: "[data-tour='tab-navigation']",
      popover: {
        title: "Switch Between Sections",
        description:
          "Navigate between Accounts, Centers, and Prospects. Each section has its own charts, tables, and maps.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "[data-tour='view-switcher']",
      popover: {
        title: "Choose Your View",
        description:
          "Toggle between Chart, Data table, and Map views. Each perspective reveals different insights about the same data.",
        side: "bottom",
        align: "start",
      },
    },
    {
      element: "[data-tour='filters-sidebar']",
      popover: {
        title: "Powerful Filtering",
        description:
          "Over 20 filter dimensions let you slice data by region, industry, revenue, headcount, and more. Filters apply across all sections simultaneously.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[data-tour='saved-filters']",
      popover: {
        title: "Save & Share Filters",
        description:
          "Save your filter combinations for quick access later. Share them with teammates so everyone works from the same view.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[data-tour='export-button']",
      popover: {
        title: "Export to Excel",
        description:
          "Download filtered data as a multi-sheet Excel workbook. Choose which datasets to include.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "[data-tour='header-actions']",
      popover: {
        title: "Quick Actions",
        description:
          "Refresh data, check notifications for recent changes, toggle dark mode, and manage your account.",
        side: "bottom",
        align: "end",
      },
    },
  ]

  if (options.hasMapView) {
    steps.push({
      element: "[data-tour='map-view']",
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
