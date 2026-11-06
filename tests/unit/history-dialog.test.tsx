// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { toast } from "sonner"
import { HistoryDialog } from "@/components/history/history-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
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
    onRemoveItem: vi.fn(),
    onRestoreHistory: vi.fn(),
    ...overrides,
  }
  // The app mounts TooltipProvider once in app/providers.tsx.
  render(
    <TooltipProvider>
      <HistoryDialog {...props} />
    </TooltipProvider>
  )
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

    expect(toast).toHaveBeenCalledWith(
      "History cleared",
      expect.objectContaining({ duration: 10_000, action: expect.objectContaining({ label: "Undo" }) })
    )
    const options = vi.mocked(toast).mock.calls[0][1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    expect(props.onRestoreHistory).toHaveBeenCalledWith(items)
  })
})

describe("History dialog", () => {
  beforeEach(() => {
    vi.mocked(toast).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("removes one record and offers an Undo that puts the list back", () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Remove Asha Rao from History" }))
    expect(props.onRemoveItem).toHaveBeenCalledWith(items[1])
    const options = vi.mocked(toast).mock.calls[0][1] as unknown as { action: { onClick: () => void } }
    options.action.onClick()
    expect(props.onRestoreHistory).toHaveBeenCalledWith(items)
  })

  it("filters by type and search", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("tab", { name: /Prospects/ }))
    expect(screen.queryByText("Acme Corp")).toBeNull()
    expect(screen.getByText("Asha Rao")).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: /All/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search history" }), { target: { value: "pune" } })
    expect(screen.getByText("Acme Corp")).toBeTruthy()
    expect(screen.queryByText("Asha Rao")).toBeNull()
  })

  it("opens a record and closes the window", () => {
    const props = renderDialog()
    fireEvent.click(screen.getByText("Acme Corp"))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(props.onItemSelect).toHaveBeenCalledWith(items[0])
  })
})

describe("useRecentItems remove", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("drops one record from state and storage", () => {
    const { result } = renderHook(() => useRecentItems())
    act(() => result.current.restoreRecentItems(items))
    act(() => result.current.removeRecentItem("prospect", "p1"))
    expect(result.current.recentItems).toEqual([items[0]])
    expect(JSON.parse(window.localStorage.getItem("br-recent-items") ?? "[]")).toEqual([items[0]])
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
