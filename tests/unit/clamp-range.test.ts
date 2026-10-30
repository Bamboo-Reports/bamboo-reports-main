import { describe, expect, it } from "vitest"
import { clampRange } from "@/hooks/use-dashboard-filters"

describe("clampRange", () => {
  const bounds = { min: 1, max: 716924 }

  it("keeps a range that is already inside the bounds", () => {
    expect(clampRange([10000, 50000], bounds)).toEqual([10000, 50000])
  })

  it("pulls bounds saved against wider data back inside", () => {
    expect(clampRange([0, 1000000], bounds)).toEqual([1, 716924])
  })

  it("pins a range beyond the data to the nearest edge", () => {
    expect(clampRange([800000, 900000], bounds)).toEqual([716924, 716924])
  })

  it("falls back to the full range when the saved range is reversed", () => {
    expect(clampRange([5000, 100], bounds)).toEqual([1, 716924])
  })
})
