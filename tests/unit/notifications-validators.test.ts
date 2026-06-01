import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  formatAbsoluteEventDate,
  formatRelativeEventDate,
  formatSummaryTitle,
  formatTableLabel,
} from "@/lib/notifications/formatters"
import { signInSchema, signUpSchema } from "@/lib/validators/auth"

describe("notification formatters and auth validators", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-29T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("formats table labels and summary titles", () => {
    expect(formatTableLabel("accounts", 1)).toBe("Account")
    expect(formatTableLabel("accounts", 2)).toBe("Accounts")
    expect(formatSummaryTitle({ table_name: "prospects", change_type: "added", record_count: 3 })).toBe("3 new Prospects added")
    expect(formatSummaryTitle({ table_name: "centers", change_type: "updated", record_count: 1 })).toBe("1 Center updated")
  })

  it("formats relative and absolute event dates with invalid fallback", () => {
    expect(formatRelativeEventDate("not-a-date")).toBe("not-a-date")
    expect(formatRelativeEventDate(new Date("2026-05-29T11:59:58Z").toISOString())).toBe("just now")
    expect(formatRelativeEventDate(new Date("2026-05-29T11:55:00Z").toISOString())).toContain("minute")
    expect(formatAbsoluteEventDate("not-a-date")).toBe("not-a-date")
    expect(formatAbsoluteEventDate(new Date("2026-05-29T11:55:00Z").toISOString())).toContain("2026")
  })

  it("validates and trims auth form input", () => {
    expect(signInSchema.parse({ email: " user@example.com ", password: "secret1" })).toEqual({
      email: "user@example.com",
      password: "secret1",
      rememberMe: true,
    })
    expect(signUpSchema.parse({
      firstName: " Ada ",
      lastName: " Lovelace ",
      email: " ada@example.com ",
      phone: "1234567",
      password: "secret1",
    })).toMatchObject({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" })
    expect(signInSchema.safeParse({ email: "bad", password: "123" }).success).toBe(false)
    expect(signUpSchema.safeParse({ firstName: "", lastName: "", email: "bad", phone: "1", password: "123" }).success).toBe(false)
  })
})
