import { describe, expect, it } from "vitest"
import {
  describeUserAgent,
  MAX_LISTED_FILTER_VALUES,
  summarizeExportFilters,
  describeWhen,
  exportTitle,
  formatBytes,
  groupByDay,
  orderDatasets,
  selectionSummary,
} from "@/lib/exports/history"

const NOW = new Date(2026, 10, 3, 17, 0) // 3 Nov 2026, 17:00 local
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h, 30).toISOString()

describe("export history", () => {
  it("names an export by its sheets, in file order", () => {
    expect(exportTitle(["prospects", "accounts", "centers", "services"])).toBe("All four sheets")
    expect(exportTitle(["centers", "accounts"])).toBe("Accounts, Centres")
    expect(orderDatasets(["prospects", "accounts"])).toEqual(["accounts", "prospects"])
    expect(exportTitle([])).toBe("Export")
  })

  it("groups by today, yesterday, this week and month", () => {
    expect(describeWhen(at(2026, 10, 3), NOW).group).toBe("Today")
    expect(describeWhen(at(2026, 10, 2), NOW).group).toBe("Yesterday")
    expect(describeWhen(at(2026, 9, 30), NOW).group).toBe("This week")
    expect(describeWhen(at(2026, 9, 14), NOW).group).toBe(new Date(2026, 9, 14).toLocaleDateString(undefined, { month: "long" }))
    expect(describeWhen(at(2025, 9, 14), NOW).group).toContain("2025")
  })

  it("keeps rows in order and starts a new group when the day changes", () => {
    const rows = [at(2026, 10, 3, 16), at(2026, 10, 3, 11), at(2026, 10, 2), at(2026, 9, 14)].map((created_at) => ({ created_at }))
    expect(groupByDay(rows, (row) => row.created_at, NOW).map((g) => [g.group, g.rows.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      [new Date(2026, 9, 14).toLocaleDateString(undefined, { month: "long" }), 1],
    ])
  })

  it("formats file sizes", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(412 * 1024)).toBe("412 KB")
    expect(formatBytes(9.6 * 1024 * 1024)).toBe("9.6 MB")
  })

  it("names the browser and system from a user agent", () => {
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36")).toBe("Chrome on Linux")
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0")).toBe("Edge on Windows")
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toBe("Safari on macOS")
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1")).toBe("Chrome on iOS")
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36 EdgA/142.0")).toBe("Edge on Android")
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/130.0 Mobile/15E148 Safari/605.1.15")).toBe("Firefox on iOS")
    expect(describeUserAgent(null)).toBeNull()
  })

  it("summarises a row selection saved with the export", () => {
    expect(selectionSummary({ selection: { dataset: "prospects", prospectIds: ["a", "b"] } })).toBe("2 prospects")
    expect(selectionSummary({ selection: { dataset: "accounts", accountNames: ["Acme"] } })).toBe("1 account")
    expect(selectionSummary({ accountVisibilityMode: "nonGcc" })).toBeNull()
    expect(selectionSummary(null)).toBeNull()
  })

  it("cuts an export's saved filters down to what the list shows", () => {
    const names = Array.from({ length: MAX_LISTED_FILTER_VALUES + 30 }, (_, i) => ({ value: `Co ${i}`, mode: "include" }))
    const summary = summarizeExportFilters({
      selection: { dataset: "accounts", accountNames: ["a", "b", "c"] },
      accountGlobalLegalNameKeywords: names,
      centerCityValues: [{ value: "Pune", mode: "include" }],
    }) as Record<string, unknown>
    expect(summary.selection).toEqual({ dataset: "accounts", count: 3 })
    expect(selectionSummary(summary)).toBe("3 accounts")
    const keywords = summary.accountGlobalLegalNameKeywords as Array<{ value: string }>
    expect(keywords).toHaveLength(MAX_LISTED_FILTER_VALUES + 1)
    expect(keywords[MAX_LISTED_FILTER_VALUES]).toEqual({ value: "and 30 more", mode: "include" })
    expect(summary.centerCityValues).toEqual([{ value: "Pune", mode: "include" }])
  })
})
