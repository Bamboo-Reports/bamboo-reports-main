// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SelectionActionBar } from "@/components/tables/selection-action-bar"

const captured = vi.hoisted(() => ({ events: [] as Array<{ event: string; props: Record<string, unknown> }> }))
vi.mock("@/lib/analytics/client", () => ({
  captureEvent: (event: string, props: Record<string, unknown>) => captured.events.push({ event, props }),
}))

describe("SelectionActionBar", () => {
  afterEach(cleanup)

  it("hides the export-all hint until the matching count is set", () => {
    render(<SelectionActionBar entity="prospect" show count={3} onClear={vi.fn()} onExport={vi.fn()} onExportAll={vi.fn()} />)
    expect(screen.queryByText(/Export all/)).toBeNull()
  })

  it("points a full-page selection at the full export", () => {
    const onExportAll = vi.fn()
    render(
      <SelectionActionBar
        entity="prospect"
        show
        count={50}
        onClear={vi.fn()}
        onExport={vi.fn()}
        matchingCount={61418}
        onExportAll={onExportAll}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Need all 61,418? Export all" }))
    expect(onExportAll).toHaveBeenCalledOnce()
    expect(captured.events.at(-1)).toEqual({
      event: "selection_export_all_clicked",
      props: { entity: "prospect", selected_count: 50, matching_count: 61418 },
    })
  })
})
