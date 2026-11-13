// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { captureEvent } from "@/lib/analytics/client"
import { useDashboardSearch } from "@/hooks/use-dashboard-search"
import type { SearchResult } from "@/lib/search"
import type { RecentItem } from "@/hooks/use-recent-items"

vi.mock("@/lib/analytics/client", () => ({ captureEvent: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))

const setTheme = vi.fn()
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme, resolvedTheme: "light" }) }))

const search = {
  query: "acme ",
  setQuery: vi.fn(),
  results: [],
  isSearching: false,
  focus: "accounts",
  setFocus: vi.fn(),
  isOpen: false,
  setIsOpen: vi.fn(),
  handleOpen: vi.fn(),
  handleClose: vi.fn(),
}
vi.mock("@/hooks/use-global-search", () => ({ useGlobalSearch: () => search }))

const recent = {
  recentItems: [],
  recentSearches: [],
  addRecentItem: vi.fn(),
  addRecentSearch: vi.fn(),
  clearRecentItems: vi.fn(),
  removeRecentItem: vi.fn(),
  restoreRecentItems: vi.fn(),
}
vi.mock("@/hooks/use-recent-items", () => ({ useRecentItems: () => recent }))

// The opener resolves straight away with a record built from the request.
type OpenArgs = { label: string; onLoaded: (record: unknown) => void }
const openRecord = vi.fn((args: OpenArgs) =>
  args.onLoaded({ label: args.label, account_global_legal_name: "Related Co" })
)
vi.mock("@/hooks/use-record-opener", () => ({ useRecordOpener: () => openRecord }))
vi.mock("@/lib/query-client", () => ({ getQueryClient: vi.fn() }))
vi.mock("@/lib/dashboard/api-client", () => ({ fetchProspectById: vi.fn() }))

const onSectionSelect = vi.fn()
const onReload = vi.fn()
const setup = () =>
  renderHook(() => useDashboardSearch({ currentScreenView: "map", onSectionSelect, onReload }))

const events = (name: string) => vi.mocked(captureEvent).mock.calls.filter(([e]) => e === name)
const accountResult = { type: "account", id: "a1", title: "Acme", data: { name: "Acme" } } as unknown as SearchResult

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  search.isOpen = false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useDashboardSearch", () => {
  it("opens a search result's dialog and reports it", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onSelectResult(accountResult))
    expect(search.handleClose).toHaveBeenCalled()
    expect(recent.addRecentSearch).toHaveBeenCalledWith("acme")
    expect(events("search_result_selected")).toEqual([["search_result_selected", { result_type: "account", query: "acme " }]])
    expect(events("record_opened")).toEqual([
      ["record_opened", { entity: "account", record_id: "a1", record_label: "Acme", source_view: "map", opened_from: "global_search" }],
    ])
    expect(result.current.recordDialogs.account).toMatchObject({ record: { name: "Acme" }, open: true })
  })

  it("reports dwell time when the dialog closes, and when another record replaces it", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onSelectResult(accountResult))
    act(() => vi.advanceTimersByTime(4000))
    act(() =>
      result.current.searchProps.onSelectResult({ type: "center", id: "c1", title: "Centre", data: {} } as unknown as SearchResult)
    )
    expect(events("record_closed")[0][1]).toEqual({
      entity: "account",
      record_id: "a1",
      dwell_seconds: 4,
      close_reason: "switch_to_another_record",
    })
    expect(result.current.recordDialogs.center.open).toBe(true)
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.recordDialogs.center.onOpenChange(false))
    expect(result.current.recordDialogs.center.open).toBe(false)
    expect(events("record_closed")[1][1]).toMatchObject({ entity: "center", dwell_seconds: 2, close_reason: "dialog_closed" })
  })

  it("tells the user when a result has no record to open", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onSelectResult({ type: "prospect", id: "p", title: "P" } as unknown as SearchResult))
    expect(toast.info).toHaveBeenCalledWith("This record is not available right now")
    expect(events("record_opened")).toHaveLength(0)
  })

  it("opens history and recent items through the record opener", () => {
    const { result } = setup()
    act(() => result.current.openHistory())
    expect(result.current.historyProps.open).toBe(true)
    const item = { type: "center", id: "c9", title: "Pune" } as RecentItem
    act(() => result.current.historyProps.onItemSelect(item))
    expect(openRecord).toHaveBeenCalledWith(expect.objectContaining({ label: "centre" }))
    expect(events("search_recent_item_selected")).toEqual([["search_recent_item_selected", { result_type: "center", source: "history_dialog" }]])
    expect(events("record_opened")[0][1]).toMatchObject({ entity: "center", record_id: "c9", opened_from: "history" })
    expect(result.current.recordDialogs.center.open).toBe(true)

    act(() => result.current.searchProps.onSelectRecentItem({ type: "prospect", id: "p1", title: "Jo" } as RecentItem))
    expect(events("record_opened")[1][1]).toMatchObject({ entity: "prospect", opened_from: "global_search" })

    act(() => result.current.historyProps.onRemoveItem(item))
    expect(recent.removeRecentItem).toHaveBeenCalledWith("center", "c9")
  })

  it("a related account link closes the parent and opens the account", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onSelectResult({ type: "center", id: "c1", title: "C", data: {} } as unknown as SearchResult))
    act(() => result.current.recordDialogs.center.onAccountOpen("Related Co"))
    expect(result.current.recordDialogs.center.open).toBe(false)
    expect(result.current.recordDialogs.account.open).toBe(true)
    expect(events("record_opened")[1][1]).toMatchObject({ entity: "account", record_id: "Related Co", opened_from: "related_account_link" })
  })

  it("runs search actions", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onSelectAction("go-centers"))
    expect(onSectionSelect).toHaveBeenCalledWith("centers")
    act(() => result.current.searchProps.onSelectAction("refresh"))
    expect(onReload).toHaveBeenCalled()
    act(() => result.current.searchProps.onSelectAction("toggle-theme"))
    expect(setTheme).toHaveBeenCalledWith("dark")
    expect(events("theme_changed")).toEqual([["theme_changed", { theme: "dark", previous_theme: "light", source: "search_action" }]])
  })

  it("dismissing search closes it fully (query and type narrowing) and reports it", () => {
    const { result } = setup()
    act(() => result.current.searchProps.onOpenChange(true))
    expect(search.handleOpen).toHaveBeenCalled()
    expect(events("search_opened")).toEqual([["search_opened", { trigger: "shortcut_or_button" }]])

    search.isOpen = true
    const open = setup()
    act(() => open.result.current.searchProps.onOpenChange(false))
    search.isOpen = false
    // handleClose clears the query, the debounced term and the "Show all" focus together.
    expect(search.handleClose).toHaveBeenCalled()
    expect(events("search_closed")).toEqual([["search_closed", { had_query: true, close_reason: "dismissed" }]])
  })

  it("reports opening search from the header button", () => {
    const { result } = setup()
    act(() => result.current.openSearch())
    expect(search.handleOpen).toHaveBeenCalled()
    expect(events("search_opened")).toEqual([["search_opened", { trigger: "shortcut_or_button" }]])
  })

  it("reports search closing when a result, recent item or action is picked", () => {
    search.isOpen = true
    const { result } = setup()
    act(() => result.current.searchProps.onSelectResult(accountResult))
    act(() => result.current.searchProps.onSelectRecentItem({ type: "prospect", id: "p1", title: "Jo" } as RecentItem))
    act(() => result.current.searchProps.onSelectAction("go-accounts"))
    expect(events("search_closed").map(([, p]) => p)).toEqual([
      { had_query: true, close_reason: "result_selected" },
      { had_query: true, close_reason: "recent_item_selected" },
      { had_query: true, close_reason: "action_selected" },
    ])
  })

  it("does not report a close when search was not open (history dialog)", () => {
    const { result } = setup()
    act(() => result.current.historyProps.onItemSelect({ type: "center", id: "c9", title: "Pune" } as RecentItem))
    expect(events("search_closed")).toHaveLength(0)
    expect(search.handleClose).toHaveBeenCalled()
  })
})
