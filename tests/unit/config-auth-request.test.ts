import { afterEach, describe, expect, it, vi } from "vitest"
import { getBrandfetchClientId, getEnvironmentLabel } from "@/lib/config/environment"
import { canExportData, normalizeUserRole } from "@/lib/auth/roles"
import { extractBearerToken } from "@/lib/auth/server"
import { getClientInfo } from "@/lib/request/client-info"
import { normalizeTickerForYahoo } from "@/lib/finance/tickers"

describe("environment, auth, request, and ticker helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("normalizes environment values", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT_LABEL", " staging ")
    vi.stubEnv("NEXT_PUBLIC_BRANDFETCH_CLIENT_ID", " client-id ")
    expect(getEnvironmentLabel()).toBe("STAGING")
    expect(getBrandfetchClientId()).toBe("client-id")
  })

  it("handles roles and bearer tokens", () => {
    expect(normalizeUserRole("admin")).toBe("admin")
    expect(normalizeUserRole("owner")).toBe("viewer")
    expect(canExportData("admin")).toBe(true)
    expect(canExportData("viewer")).toBe(false)
    expect(extractBearerToken("Bearer abc")).toBe("abc")
    expect(extractBearerToken("bearer abc")).toBeNull()
    expect(extractBearerToken(null)).toBeNull()
  })

  it("extracts client IP and user agent headers", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": " 203.0.113.10, 10.0.0.1",
        "user-agent": "Vitest",
      },
    })
    expect(getClientInfo(request)).toEqual({ ip: "203.0.113.10", userAgent: "Vitest" })
  })

  it("normalizes exchange-prefixed tickers for Yahoo Finance", () => {
    expect(normalizeTickerForYahoo(" LON: vod ")).toBe("VOD.L")
    expect(normalizeTickerForYahoo("nasdaq:msft")).toBe("MSFT")
    expect(normalizeTickerForYahoo("")).toBe("")
  })
})
