import { describe, expect, it } from "vitest"
import { cn, ensureAbsoluteUrl } from "@/lib/utils"

describe("cn", () => {
  it("joins truthy class values", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b")
  })

  it("merges conflicting tailwind classes, keeping the last", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("returns an empty string when nothing is passed", () => {
    expect(cn()).toBe("")
  })
})

describe("ensureAbsoluteUrl", () => {
  it("leaves an http url untouched", () => {
    expect(ensureAbsoluteUrl("http://example.com")).toBe("http://example.com")
  })

  it("leaves an https url untouched", () => {
    expect(ensureAbsoluteUrl("https://example.com")).toBe("https://example.com")
  })

  it("is case insensitive about the scheme", () => {
    expect(ensureAbsoluteUrl("HTTPS://example.com")).toBe("HTTPS://example.com")
  })

  it("prefixes a bare domain with https", () => {
    expect(ensureAbsoluteUrl("example.com")).toBe("https://example.com")
  })

  it("does not treat other schemes as absolute", () => {
    expect(ensureAbsoluteUrl("ftp://example.com")).toBe("https://ftp://example.com")
  })
})
