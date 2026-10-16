// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDashboardTourSteps } from "@/lib/tour/steps"

const tourTargets = (steps: ReturnType<typeof getDashboardTourSteps>) =>
  steps
    .map((step) => (step.element as HTMLElement | undefined)?.dataset.tour)
    .filter(Boolean)

// Mirrors filters-sidebar.tsx: the expanded panel stays mounted and is marked
// data-tour-hidden while the sidebar is collapsed. `opacity` lets a test
// render the panel part way through its fade.
function renderSidebar(collapsed: boolean, opacity = collapsed ? 0 : 1) {
  document.body.innerHTML = `
    <aside data-tour="filters-sidebar">
      <div style="opacity: ${opacity}"${collapsed ? " data-tour-hidden" : ""}>
        <div data-tour="saved-filters">
          <button data-tour="export-button">Export</button>
        </div>
      </div>
    </aside>
  `
}

describe("getDashboardTourSteps", () => {
  beforeEach(() => {
    // jsdom has no layout, so give every element a box.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ""
  })

  it("includes the saved filters and export steps when the sidebar is expanded", () => {
    renderSidebar(false)
    const steps = getDashboardTourSteps({ hasMapView: false, isSidebarCollapsed: false })
    expect(tourTargets(steps)).toEqual(["filters-sidebar", "saved-filters", "export-button"])
  })

  it("skips steps whose target sits inside the hidden panel", () => {
    renderSidebar(true)
    const steps = getDashboardTourSteps({ hasMapView: false, isSidebarCollapsed: true })
    expect(tourTargets(steps)).toEqual(["filters-sidebar"])
  })

  it("follows the toggle, not the opacity, while the panel is still fading", () => {
    renderSidebar(true, 1)
    expect(tourTargets(getDashboardTourSteps({ hasMapView: false, isSidebarCollapsed: true }))).toEqual(["filters-sidebar"])

    renderSidebar(false, 0.2)
    expect(tourTargets(getDashboardTourSteps({ hasMapView: false, isSidebarCollapsed: false }))).toEqual([
      "filters-sidebar",
      "saved-filters",
      "export-button",
    ])
  })

  it("always ends with the closing step", () => {
    renderSidebar(true)
    const steps = getDashboardTourSteps({ hasMapView: false, isSidebarCollapsed: true })
    expect(steps.at(-1)?.element).toBeUndefined()
    expect(steps.at(-1)?.popover?.title).toBe("You're All Set!")
  })
})
