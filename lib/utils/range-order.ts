const UNIT_SCALE: Record<string, number> = { K: 1e3, Mn: 1e6, Bn: 1e9 }

/**
 * Lower bound of a bucket label such as "<50", "51 - 100", "1K - 5K",
 * "10Mn - 50Mn" or ">50Bn", for putting buckets in range order. "<X" sorts
 * first; a label without a number (e.g. "Unknown") sorts last. Mirrors
 * rangeOrder in lib/dashboard/entity-query.ts, which sorts the tables.
 */
export function rangeLowerBound(label: string): number {
  if (label.trim().startsWith("<")) return -1
  const match = label.match(/([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)/)
  if (!match) return Number.POSITIVE_INFINITY
  return Number(match[1]) * (UNIT_SCALE[match[2]] ?? 1)
}

export function compareRangeLabels(a: string, b: string): number {
  return rangeLowerBound(a) - rangeLowerBound(b)
}
