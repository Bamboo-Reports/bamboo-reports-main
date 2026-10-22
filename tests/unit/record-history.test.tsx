// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Center, Prospect } from "@/lib/types"
import { RecordHistoryProvider } from "@/contexts/record-history-context"
import { ProspectDetailsDialog } from "@/components/dialogs/prospect-details-dialog"
import { CenterDetailsDialog } from "@/components/dialogs/center-details-dialog"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom has no Element.scrollTo; the dialog scrolls to the top on a contact switch.
  Element.prototype.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
})

const prospect = (key: string, first: string, last: string): Prospect =>
  ({
    ps_unique_key: key,
    account_global_legal_name: "Acme Corp",
    prospect_first_name: first,
    prospect_last_name: last,
    prospect_full_name: `${first} ${last}`,
    prospect_title: "Director",
    prospect_city: "Pune",
  }) as unknown as Prospect

// History records every record a detail dialog shows, including ones opened
// from inside another dialog, not only top-level opens (#310).
describe("detail dialogs record what they show in History (#310)", () => {
  it("records the prospect it opens with and a contact switched to from More Contacts", () => {
    const recordOpened = vi.fn()
    const first = prospect("p1", "Asha", "Rao")
    const second = prospect("p2", "Ben", "Iyer")
    render(
      <RecordHistoryProvider recordOpened={recordOpened}>
        <ProspectDetailsDialog prospect={first} allProspects={[first, second]} open onOpenChange={() => {}} />
      </RecordHistoryProvider>
    )
    expect(recordOpened).toHaveBeenLastCalledWith(expect.objectContaining({ type: "prospect", id: "p1", title: "Asha Rao" }))

    // The only contact card left in More Contacts is Ben's.
    fireEvent.click(screen.getByRole("button", { name: /View Details/ }))
    expect(recordOpened).toHaveBeenLastCalledWith(expect.objectContaining({ type: "prospect", id: "p2", title: "Ben Iyer" }))
  })

  it("records a centre when its dialog opens", () => {
    const recordOpened = vi.fn()
    const center = {
      cn_unique_key: "c1",
      center_name: "Acme India Pvt. Ltd.",
      account_global_legal_name: "Acme Corp",
      center_city: "Pune",
      center_state: "Maharashtra",
    } as unknown as Center
    render(
      <RecordHistoryProvider recordOpened={recordOpened}>
        <CenterDetailsDialog center={center} services={[]} tech={[]} open onOpenChange={() => {}} />
      </RecordHistoryProvider>
    )
    expect(recordOpened).toHaveBeenCalledWith(expect.objectContaining({ type: "center", id: "c1", title: "Acme India Pvt. Ltd." }))
  })

  it("records nothing while a dialog is closed", () => {
    const recordOpened = vi.fn()
    render(
      <RecordHistoryProvider recordOpened={recordOpened}>
        <ProspectDetailsDialog prospect={prospect("p1", "Asha", "Rao")} allProspects={[]} open={false} onOpenChange={() => {}} />
      </RecordHistoryProvider>
    )
    expect(recordOpened).not.toHaveBeenCalled()
  })
})
