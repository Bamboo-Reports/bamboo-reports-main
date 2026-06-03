import { afterEach, describe, expect, it } from "vitest"

describe("getMaptilerStyleUrl", () => {
  const ORIGINAL_STATE_STYLE = process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID
  const ORIGINAL_CITY_STYLE = process.env.NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID
  const ORIGINAL_LEGACY = process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID

  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID = ORIGINAL_STATE_STYLE
    process.env.NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID = ORIGINAL_CITY_STYLE
    process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID = ORIGINAL_LEGACY
  })

  it("uses mode-specific style ID when available", async () => {
    process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID = "state-style-123"
    process.env.NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID = "city-style-456"
    const { getMaptilerStyleUrl } = await import("@/lib/config/maptiler")
    expect(getMaptilerStyleUrl("state", "key-abc")).toContain("state-style-123")
    expect(getMaptilerStyleUrl("city", "key-abc")).toContain("city-style-456")
  })

  it("falls back to legacy style ID when mode-specific is not set", async () => {
    delete process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID
    delete process.env.NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID
    process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID = "legacy-style-789"
    const { getMaptilerStyleUrl } = await import("@/lib/config/maptiler")
    expect(getMaptilerStyleUrl("state", "key-abc")).toContain("legacy-style-789")
    expect(getMaptilerStyleUrl("city", "key-abc")).toContain("legacy-style-789")
  })

  it("uses default style IDs when no env vars are set", async () => {
    delete process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID
    delete process.env.NEXT_PUBLIC_MAPTILER_CITY_STYLE_ID
    delete process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID
    const { getMaptilerStyleUrl } = await import("@/lib/config/maptiler")
    expect(getMaptilerStyleUrl("state", "key-abc")).toContain("019ce66f-f725-7e90-8ee4-73d922c757ae")
    expect(getMaptilerStyleUrl("city", "key-abc")).toContain("019ce66d-62cb-7eea-86d1-74e365735ec1")
  })

  it("builds full style URL with API key", async () => {
    delete process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID
    delete process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID
    const { getMaptilerStyleUrl } = await import("@/lib/config/maptiler")
    const url = getMaptilerStyleUrl("state", "my-api-key")
    expect(url).toBe("https://api.maptiler.com/maps/019ce66f-f725-7e90-8ee4-73d922c757ae/style.json?key=my-api-key")
  })

  it("extracts style ID from MapTiler map URL", async () => {
    process.env.NEXT_PUBLIC_MAPTILER_STATE_STYLE_ID = "https://cloud.maptiler.com/maps/abc123/"
    delete process.env.NEXT_PUBLIC_MAPTILER_STYLE_ID
    const { getMaptilerStyleUrl } = await import("@/lib/config/maptiler")
    expect(getMaptilerStyleUrl("state", "key-abc")).toContain("abc123")
  })
})

describe("getMaptilerCountriesTilesUrl", () => {
  it("builds tiles URL with API key", async () => {
    const { getMaptilerCountriesTilesUrl } = await import("@/lib/config/maptiler")
    const url = getMaptilerCountriesTilesUrl("my-key")
    expect(url).toBe("https://api.maptiler.com/tiles/countries/tiles.json?key=my-key")
  })
})
