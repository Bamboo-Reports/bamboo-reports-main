import { describe, expect, it } from "vitest"
import { BUBBLE_MAX_RADIUS, BUBBLE_MIN_RADIUS, bubbleRadius } from "@/lib/maps/bubble-size"

describe("bubbleRadius", () => {
  it("runs from the minimum for one centre to the maximum for the largest city", () => {
    expect(bubbleRadius(1, 1502)).toBe(BUBBLE_MIN_RADIUS)
    expect(bubbleRadius(1502, 1502)).toBe(BUBBLE_MAX_RADIUS)
  })

  it("tells small counts apart", () => {
    expect(bubbleRadius(3, 1540) - bubbleRadius(1, 1540)).toBeGreaterThan(1.4)
    expect(bubbleRadius(9, 1540) - bubbleRadius(3, 1540)).toBeGreaterThan(1.4)
  })

  it("keeps the hotspots apart too", () => {
    // Real counts: Gurugram 514, Pune 784, Bengaluru 1,540.
    expect(bubbleRadius(784, 1540) - bubbleRadius(514, 1540)).toBeGreaterThan(1)
    expect(bubbleRadius(1540, 1540) - bubbleRadius(784, 1540)).toBeGreaterThan(1.75)
  })

  it("grows with the count and never passes the maximum", () => {
    let previous = 0
    for (const count of [1, 2, 3, 5, 10, 50, 100, 500, 1000, 1502, 5000]) {
      const radius = bubbleRadius(count, 1502)
      expect(radius).toBeGreaterThanOrEqual(previous)
      expect(radius).toBeLessThanOrEqual(BUBBLE_MAX_RADIUS)
      previous = radius
    }
  })

  it("uses the minimum when there is nothing to compare", () => {
    expect(bubbleRadius(5, 1)).toBe(BUBBLE_MIN_RADIUS)
  })
})
