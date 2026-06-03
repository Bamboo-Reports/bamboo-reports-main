import { describe, expect, it, vi, beforeAll, afterAll } from "vitest"
import {
  formatAbsoluteEventDate,
  formatRelativeEventDate,
  formatSummaryTitle,
  formatTableLabel,
} from "@/lib/notifications/formatters"

describe("notification formatters", () => {
  describe("formatTableLabel", () => {
    it("returns plural label for count != 1", () => {
      expect(formatTableLabel("accounts", 0)).toBe("Accounts")
      expect(formatTableLabel("Accounts", 2)).toBe("Accounts")
    })

    it("returns singular label for count === 1", () => {
      expect(formatTableLabel("accounts", 1)).toBe("Account")
      expect(formatTableLabel("centers", 1)).toBe("Center")
    })

    it("falls back to normalized string if not found in map", () => {
      expect(formatTableLabel("unknown", 1)).toBe("unknown")
      expect(formatTableLabel(" UNKNOWN ", 2)).toBe("unknown")
    })
  })

  describe("formatSummaryTitle", () => {
    it("formats 'added' changes", () => {
      expect(
        formatSummaryTitle({ table_name: "accounts", change_type: "added", record_count: 5 })
      ).toBe("5 new Accounts added")
      
      expect(
        formatSummaryTitle({ table_name: "prospects", change_type: "added", record_count: 1 })
      ).toBe("1 new Prospect added")
    })

    it("formats 'updated' changes", () => {
      expect(
        formatSummaryTitle({ table_name: "centers", change_type: "updated", record_count: 3 })
      ).toBe("3 Centers updated")
      
      expect(
        formatSummaryTitle({ table_name: "accounts", change_type: "updated", record_count: 1 })
      ).toBe("1 Account updated")
    })
  })

  describe("formatRelativeEventDate", () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2024-01-10T12:00:00Z"))
    })

    afterAll(() => {
      vi.useRealTimers()
    })

    it("returns original string if unparseable", () => {
      expect(formatRelativeEventDate("invalid-date")).toBe("invalid-date")
    })

    it("formats just now", () => {
      expect(formatRelativeEventDate("2024-01-10T11:59:58Z")).toBe("just now")
    })

    it("formats seconds", () => {
      expect(formatRelativeEventDate("2024-01-10T11:59:30Z")).toMatch(/30 seconds ago/)
    })

    it("formats minutes", () => {
      expect(formatRelativeEventDate("2024-01-10T11:50:00Z")).toMatch(/10 minutes ago/)
    })

    it("formats hours", () => {
      expect(formatRelativeEventDate("2024-01-10T09:00:00Z")).toMatch(/3 hours ago/)
    })

    it("formats days", () => {
      expect(formatRelativeEventDate("2024-01-08T12:00:00Z")).toMatch(/2 days ago/)
    })

    it("falls back to absolute date for > 7 days", () => {
      // 10 days ago
      expect(formatRelativeEventDate("2023-12-31T12:00:00Z")).toBe(
        new Date("2023-12-31T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      )
    })
  })

  describe("formatAbsoluteEventDate", () => {
    it("returns original string if unparseable", () => {
      expect(formatAbsoluteEventDate("invalid-date")).toBe("invalid-date")
    })

    it("formats correctly", () => {
      const dateString = "2024-01-10T12:30:00Z"
      const expected = new Date(dateString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      expect(formatAbsoluteEventDate(dateString)).toBe(expected)
    })
  })
})
