import { describe, expect, it } from "vitest"
import { REVENUE_PRESETS, YEARS_IN_INDIA_PRESETS } from "@/components/filters/filter-sections"

describe.each([
  ["revenue", REVENUE_PRESETS],
  ["years in India", YEARS_IN_INDIA_PRESETS],
])("%s presets", (_name, presets) => {
  it("never overlap, so no value counts in two presets", () => {
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].range[0]).toBeGreaterThan(presets[i - 1].range[1])
    }
  })

  it("leave no gap between neighbours for whole-number values", () => {
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].range[0]).toBe(presets[i - 1].range[1] + 1)
    }
  })
})
