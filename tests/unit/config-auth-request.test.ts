import { afterEach, describe, expect, it, vi } from "vitest"
import {
  assertDatasetEnabled,
  assertSectionEnabled,
  canAccessAccountsMapView,
  getAccessibleDefaultSection,
  getDatasetUnavailableMessage,
  getEnabledSections,
  getProspectsPerAccountLimit,
  getSectionUnavailableMessage,
  isDatasetEnabled,
  isSectionDisabled,
  isSectionEnabled,
} from "@/lib/config/dashboard-access"
import { getEnvironmentLabel, getLogoDevPublicKey } from "@/lib/config/environment"
import { getMaptilerCountriesTilesUrl, getMaptilerStyleUrl } from "@/lib/config/maptiler"
import { canExportData, normalizeUserRole } from "@/lib/auth/roles"
import { extractBearerToken } from "@/lib/auth/server"
import { getClientInfo } from "@/lib/request/client-info"
import { normalizeTickerForYahoo } from "@/lib/finance/tickers"

describe("config, auth, request, and ticker helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reports enabled dashboard sections and datasets", () => {
    expect(getEnabledSections()).toEqual(["accounts", "centers", "prospects"])
    expect(getAccessibleDefaultSection()).toBe("accounts")
    expect(isSectionEnabled("accounts")).toBe(true)
    expect(isSectionDisabled("accounts")).toBe(false)
    expect(isDatasetEnabled("services")).toBe(true)
    expect(canAccessAccountsMapView()).toBe(true)
    expect(getProspectsPerAccountLimit()).toBeNull()
    expect(() => assertSectionEnabled("accounts")).not.toThrow()
    expect(() => assertDatasetEnabled("accounts")).not.toThrow()
    expect(getSectionUnavailableMessage("centers")).toBe("Centers is Not Procured.")
    expect(getDatasetUnavailableMessage("services")).toBe("Services export is Not Procured.")
  })

  it("normalizes environment values", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT_LABEL", " staging ")
    vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN", " token ")
    expect(getEnvironmentLabel()).toBe("STAGING")
    expect(getLogoDevPublicKey()).toBe("token")
  })

  it("builds MapTiler URLs from defaults, direct ids, and map URLs", () => {
    expect(getMaptilerCountriesTilesUrl("key")).toBe("https://api.maptiler.com/tiles/countries/tiles.json?key=key")
    expect(getMaptilerStyleUrl("state", "key")).toContain("/maps/019ce66f-f725-7e90-8ee4-73d922c757ae/style.json?key=key")
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID", "https://cloud.maptiler.com/maps/custom-city/")
    expect(getMaptilerStyleUrl("city", "key")).toBe("https://api.maptiler.com/maps/custom-city/style.json?key=key")
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
