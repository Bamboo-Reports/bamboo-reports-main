import { describe, expect, it } from "vitest"
import { calculateAnimatedNumberValue } from "@/components/dashboard/summary-cards"

describe("summary card animated numbers", () => {
  it.each([
    ["accounts", 2657],
    ["centers", 4200],
    ["upcoming centers", 180],
    ["prospects", 12000],
    ["headcount", 250000],
  ])("does not show zero when %s animates down to one visible result", (_label, startValue) => {
    const values = Array.from({ length: 101 }, (_, index) =>
      calculateAnimatedNumberValue({
        startValue,
        targetValue: 1,
        progress: index / 100,
      })
    )

    expect(Math.min(...values)).toBeGreaterThanOrEqual(1)
    expect(values.at(-1)).toBe(1)
  })
})
