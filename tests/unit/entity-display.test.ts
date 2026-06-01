import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ENTITY_TYPE_META, formatTimeAgo } from "@/lib/dashboard/entity-display"

const NOW = new Date("2026-05-29T12:00:00Z")
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatTimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 'Just now' for under a minute", () => {
    expect(formatTimeAgo(NOW.getTime() - 30 * 1000)).toBe("Just now")
  })

  it("returns minutes for under an hour", () => {
    expect(formatTimeAgo(NOW.getTime() - 5 * MINUTE)).toBe("5m ago")
  })

  it("returns hours for under a day", () => {
    expect(formatTimeAgo(NOW.getTime() - 2 * HOUR)).toBe("2h ago")
  })

  it("returns 'Yesterday' for one day ago", () => {
    expect(formatTimeAgo(NOW.getTime() - 25 * HOUR)).toBe("Yesterday")
  })

  it("returns days for under a week", () => {
    expect(formatTimeAgo(NOW.getTime() - (3 * DAY + HOUR))).toBe("3d ago")
  })

  it("returns a formatted date for a week or more ago", () => {
    const ts = NOW.getTime() - 10 * DAY
    expect(formatTimeAgo(ts)).toBe(
      new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    )
  })

  it("accepts an ISO string", () => {
    const iso = new Date(NOW.getTime() - 5 * MINUTE).toISOString()
    expect(formatTimeAgo(iso)).toBe("5m ago")
  })

  it("returns an empty string for an unparseable value", () => {
    expect(formatTimeAgo("not-a-date")).toBe("")
    expect(formatTimeAgo(Number.NaN)).toBe("")
  })
})

describe("ENTITY_TYPE_META", () => {
  it("covers account, center, and prospect with a label and icon", () => {
    for (const type of ["account", "center", "prospect"] as const) {
      const meta = ENTITY_TYPE_META[type]
      expect(meta).toBeDefined()
      expect(typeof meta.label).toBe("string")
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.icon).toBeTruthy()
    }
  })
})
