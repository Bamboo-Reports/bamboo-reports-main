// @vitest-environment jsdom
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

function StateOpenedDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open record
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Record</DialogTitle>
          <DialogDescription>Details</DialogDescription>
          <button type="button" onClick={() => setOpen(false)}>
            Done
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe("DialogContent focus return (#365)", () => {
  afterEach(() => cleanup())

  it("returns focus to the element that opened a dialog without a DialogTrigger", async () => {
    render(<StateOpenedDialog />)
    const opener = screen.getByRole("button", { name: "Open record" })
    opener.focus()
    act(() => {
      fireEvent.click(opener)
    })
    const done = await screen.findByRole("button", { name: "Done" })
    expect(document.activeElement).not.toBe(opener)

    act(() => {
      fireEvent.click(done)
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})
