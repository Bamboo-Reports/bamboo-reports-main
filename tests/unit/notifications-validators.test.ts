import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  formatAbsoluteEventDate,
  formatRelativeEventDate,
  formatTableLabel,
} from "@/lib/notifications/formatters"
import { signInSchema } from "@/lib/validators/auth"

describe("notification formatters and auth validators", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-29T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("formats table labels", () => {
    expect(formatTableLabel("accounts", 1)).toBe("Account")
    expect(formatTableLabel("accounts", 2)).toBe("Accounts")
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
    expect(signInSchema.safeParse({ email: "bad", password: "123" }).success).toBe(false)
  })
})
