// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ExportDialog } from "@/components/export/export-dialog"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("@/lib/exports/request-client", () => ({
  requestServerExport: vi.fn(),
  resolveExportDownloadUrl: vi.fn(),
}))

// Server mode (#249): the client holds no filtered rows, only per-dataset counts.
const emptyData = { accounts: [], centers: [], services: [], prospects: [] }
const rowCounts = { accounts: 327, centers: 475, services: 473, prospects: 3484 }

function renderDialog(onOpenChange = () => {}) {
  render(
    <ExportDialog open onOpenChange={onOpenChange} data={emptyData} isFiltered rowCounts={rowCounts} filters={{}} />
  )
}

describe("ExportDialog row counts in server mode (#307)", () => {
  afterEach(() => {
    cleanup()
    vi.mocked(captureEvent).mockReset()
  })

  it("shows the server row count on each dataset card", () => {
    renderDialog()
    for (const [label, count] of [
      ["Accounts", "327"],
      ["Centres", "475"],
      ["Services", "473"],
      ["Prospects", "3,484"],
    ]) {
      const card = screen.getAllByText(label).map((el) => el.closest("label")).find(Boolean)
      expect(card?.textContent).toContain(`${count} rows`)
    }
    expect(screen.queryByText("0 rows")).toBeNull()
  })

  it("reports the server row counts when the export is cancelled", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.EXPORT_CANCELLED,
      expect.objectContaining({
        row_count_accounts: 327,
        row_count_centers: 475,
        row_count_services: 473,
        row_count_prospects: 3484,
      })
    )
  })
})
