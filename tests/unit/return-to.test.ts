import { describe, expect, it } from "vitest"
import { returnPathFrom, signInPath } from "@/lib/auth/return-to"

describe("sign-in return path", () => {
  it("carries the dashboard query string through sign-in and back", () => {
    const search = "?view=centers&f=abc%3D"
    const signIn = signInPath(search)
    expect(signIn.startsWith("/signin?next=")).toBe(true)
    expect(returnPathFrom(new URL(signIn, "https://example.test").searchParams)).toBe(`/${search}`)
  })

  it("goes to the plain pages when there is nothing to carry", () => {
    expect(signInPath("")).toBe("/signin")
    expect(returnPathFrom(new URLSearchParams())).toBe("/")
  })

  it("never returns anywhere but the dashboard", () => {
    for (const next of ["//evil.test", "https://evil.test", "/other", "evil"]) {
      expect(returnPathFrom(new URLSearchParams({ next }))).toBe("/")
    }
  })
})
