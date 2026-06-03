import { describe, expect, it } from "vitest"

describe("dynamic imports resolve to named exports", () => {
  it("centers-map exports CentersMap", async () => {
    const mod = await import("@/components/maps/centers-map")
    expect(typeof mod.CentersMap).toBe("function")
  })

  it("centers-choropleth-map exports CentersChoroplethMap", async () => {
    const mod = await import("@/components/maps/centers-choropleth-map")
    expect(typeof mod.CentersChoroplethMap).toBe("function")
  })

  it("account-details-tabbed-dialog exports AccountDetailsDialog", async () => {
    const mod = await import("@/components/dialogs/account-details-tabbed-dialog")
    expect(typeof mod.AccountDetailsDialog).toBe("function")
  })

  it("center-details-dialog exports CenterDetailsDialog", async () => {
    const mod = await import("@/components/dialogs/center-details-dialog")
    expect(typeof mod.CenterDetailsDialog).toBe("function")
  })

  it("prospect-details-dialog exports ProspectDetailsDialog", async () => {
    const mod = await import("@/components/dialogs/prospect-details-dialog")
    expect(typeof mod.ProspectDetailsDialog).toBe("function")
  })
})
