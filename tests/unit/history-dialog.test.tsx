// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { toast } from "sonner"
import { HistoryDialog } from "@/components/history/history-dialog"
import { useRecentItems, type RecentItem } from "@/hooks/use-recent-items"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: () => {} }))
vi.mock("sonner", () => ({ toast: vi.fn() }))

const items: RecentItem[] = [
  { type: "account", id: "Acme Corp", title: "Acme Corp", subtitle: "Pune, India", viewedAt: 2 },
  { type: "prospect", id: "p1", title: "Asha Rao", subtitle: "Director", viewedAt: 1 },
]

function renderDialog(overrides: Partial<React.ComponentProps<typeof HistoryDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    recentItems: items,
    onItemSelect: vi.fn(),
    onClearHistory: vi.fn(),
    onRestoreHistory: vi.fn(),
    ...overrides,
  }
  render(<HistoryDialog {...props} />)
  return props
}

// Clearing history must not be one stray keypress away, and must be undoable (#311).
describe("History dialog clear (#311)", () => {
  beforeEach(() => {
    vi.mocked(toast).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("does not focus Clear history when it opens", () => {
    renderDialog()
    const clear = screen.getByRole("button", { name: /Clear history/ })
    expect(document.activeElement).not.toBe(clear)
  })

  it("clears and offers an Undo that restores the same items", () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: /Clear history/ }))
    expect(props.onClearHistory).toHaveBeenCalledTimes(1)

    expect(toast).toHaveBeenCalledWith("History cleared", expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }))
    const options = vi.mocked(toast).mock.calls[0][1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    expect(props.onRestoreHistory).toHaveBeenCalledWith(items)
  })
})

describe("useRecentItems restore (#311)", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("puts cleared items back in state and storage", () => {
    const { result } = renderHook(() => useRecentItems())
    act(() => result.current.restoreRecentItems(items))
    expect(result.current.recentItems).toEqual(items)
    expect(JSON.parse(window.localStorage.getItem("br-recent-items") ?? "[]")).toEqual(items)
  })
})
