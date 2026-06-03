import { describe, expect, it } from "vitest"
import { extractBearerToken } from "@/lib/auth/server"

describe("extractBearerToken", () => {
  it("extracts token from valid Bearer header", () => {
    expect(extractBearerToken("Bearer token123")).toBe("token123")
  })

  it("returns null for null input", () => {
    expect(extractBearerToken(null)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractBearerToken("")).toBeNull()
  })

  it("returns null for malformed single part", () => {
    expect(extractBearerToken("Bearertoken123")).toBeNull()
  })

  it("returns null for wrong scheme", () => {
    expect(extractBearerToken("Basic dG9rZW4=")).toBeNull()
  })

  it("returns null when token part is empty", () => {
    expect(extractBearerToken("Bearer ")).toBeNull()
  })

  it("extracts token with special characters", () => {
    expect(extractBearerToken("Bearer eyJhbGciOiJIUzI1NiJ9.token")).toBe("eyJhbGciOiJIUzI1NiJ9.token")
  })
})
