import { describe, expect, it } from "vitest"
import { daysBetween, engagementKind, formatDaysAgo, formatGap, parseEngagedDate, sortEngagements } from "@/lib/dashboard/engagements"

describe("parseEngagedDate", () => {
  it("parses the sheet's day-Month-year format", () => {
    expect(parseEngagedDate("8-September-2026")).toBe(Date.UTC(2026, 8, 8))
    expect(parseEngagedDate("29-July-2026")).toBe(Date.UTC(2026, 6, 29))
  })

  it("accepts short month names, any case, and surrounding spaces", () => {
    expect(parseEngagedDate(" 12-aug-2025 ")).toBe(Date.UTC(2025, 7, 12))
    expect(parseEngagedDate("1-SEPT-2026")).toBe(Date.UTC(2026, 8, 1))
  })

  it("returns null for blank, malformed or impossible dates", () => {
    expect(parseEngagedDate(null)).toBeNull()
    expect(parseEngagedDate("")).toBeNull()
    expect(parseEngagedDate("2026-09-08")).toBeNull()
    expect(parseEngagedDate("8-Smarch-2026")).toBeNull()
    expect(parseEngagedDate("31-February-2026")).toBeNull()
  })
})

describe("sortEngagements", () => {
  const row = (date: string | null, campaign: string) => ({ prospect_engaged_date: date, prospect_engaged_campaign: campaign })

  it("orders oldest first by date, not by text", () => {
    const sorted = sortEngagements([
      row("29-July-2026", "Registration"),
      row("8-September-2026", "Download"),
      row("12-June-2025", "Q2 Snapshot"),
      row("10-August-2026", "List Download"),
    ])
    expect(sorted.map((r) => r.prospect_engaged_campaign)).toEqual(["Q2 Snapshot", "Registration", "List Download", "Download"])
  })

  it("puts undated rows last and breaks date ties by campaign name", () => {
    const sorted = sortEngagements([
      row(null, "Unknown"),
      row("1-August-2026", "B"),
      row("1-August-2026", "A"),
    ])
    expect(sorted.map((r) => r.prospect_engaged_campaign)).toEqual(["A", "B", "Unknown"])
  })
})

describe("engagementKind", () => {
  it("reads the campaign type from the name", () => {
    expect(engagementKind("BR Q2 2026 Registration Campaign")).toBe("registration")
    expect(engagementKind("BR Q2 2026 Download Campaign")).toBe("download")
    expect(engagementKind("BR List Download")).toBe("download")
    expect(engagementKind("Q4 Snapshot")).toBe("snapshot")
    expect(engagementKind("Webinar")).toBe("campaign")
    expect(engagementKind(null)).toBe("campaign")
  })
})

describe("daysBetween / formatDaysAgo / formatGap", () => {
  it("counts whole days and tolerates unparseable dates", () => {
    expect(daysBetween(Date.UTC(2026, 6, 29), Date.UTC(2026, 8, 8))).toBe(41)
    expect(daysBetween(null, Date.UTC(2026, 8, 8))).toBeNull()
  })

  it("formats recency in the coarsest useful unit", () => {
    expect(formatDaysAgo(0)).toBe("today")
    expect(formatDaysAgo(1)).toBe("yesterday")
    expect(formatDaysAgo(9)).toBe("9 days ago")
    expect(formatDaysAgo(36)).toBe("5 weeks ago")
    expect(formatDaysAgo(45)).toBe("6 weeks ago")
    expect(formatDaysAgo(65)).toBe("2 months ago")
    expect(formatDaysAgo(800)).toBe("2 years ago")
  })

  it("labels the gap between touchpoints", () => {
    expect(formatGap(0)).toBe("Same day")
    expect(formatGap(1)).toBe("1 day later")
    expect(formatGap(41)).toBe("41 days later")
  })
})
