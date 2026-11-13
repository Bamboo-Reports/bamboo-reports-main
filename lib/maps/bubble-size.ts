/** Smallest bubble: just large enough to hold a one-digit count. */
export const BUBBLE_MIN_RADIUS = 7
/** Largest bubble, for the biggest city in view. */
export const BUBBLE_MAX_RADIUS = 20
/** Share of the square-root term in the blend (the rest is logarithmic). */
const SQRT_WEIGHT = 0.3

/**
 * Radius in pixels for a city bubble.
 *
 * Centres per city are very skewed: about half the cities have 1 centre, most
 * of the rest under 10, and six hotspots sit between 500 and 800 next to one
 * of over 1,500. A log scale tells the small counts apart but squeezes the
 * hotspots together; a square-root scale (area proportional to the count)
 * separates the hotspots but gives every small city the same dot. The blend
 * below, 70% log and 30% square root, was fitted on the real counts so that
 * small counts and hotspots both step up visibly, within the same 7 to 20px
 * range the map has always used so bubbles do not crowd it. The minimum
 * leaves room for a one-digit number.
 */
export function bubbleRadius(
  count: number,
  maxCount: number,
  minRadius = BUBBLE_MIN_RADIUS,
  maxRadius = BUBBLE_MAX_RADIUS
): number {
  if (count <= 1 || maxCount <= 1) return minRadius
  const capped = Math.min(count, maxCount)
  const logShare = Math.log10(capped) / Math.log10(maxCount)
  const sqrtShare = Math.sqrt((capped - 1) / (maxCount - 1))
  const share = (1 - SQRT_WEIGHT) * logShare + SQRT_WEIGHT * sqrtShare
  return minRadius + share * (maxRadius - minRadius)
}
