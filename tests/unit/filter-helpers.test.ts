import { describe, expect, it } from "vitest"
import {
  countFiltersByMode,
  createKeywordMatcher,
  createValueMatcher,
  enhancedFilterMatch,
  enhancedKeywordMatch,
  extractFilterValues,
  hasActiveFilters,
  toFilterValues,
} from "@/lib/utils/filter-helpers"
import { fv } from "../fixtures/domain"

describe("filter helpers", () => {
  it("matches everything when no values are selected", () => {
    expect(createValueMatcher([])("anything")).toBe(true)
    expect(createKeywordMatcher([])("anything")).toBe(true)
  })

  it("supports include and exclude value filters", () => {
    const matcher = createValueMatcher([fv("India"), fv("USA", "exclude")])
    expect(matcher("India")).toBe(true)
    expect(matcher("USA")).toBe(false)
    expect(matcher("Germany")).toBe(false)
  })

  it("allows null values only when there are no include filters", () => {
    expect(createValueMatcher([fv("India")])(null)).toBe(false)
    expect(createValueMatcher([fv("USA", "exclude")])(null)).toBe(true)
  })

  it("matches keyword filters case-insensitively and applies exclusions first", () => {
    const matcher = createKeywordMatcher([fv("engineer"), fv("intern", "exclude")])
    expect(matcher("Senior Engineering Leader")).toBe(true)
    expect(matcher("Engineering Intern")).toBe(false)
    expect(matcher("Sales Leader")).toBe(false)
  })

  it("keeps enhanced matcher behavior aligned with compiled matchers", () => {
    expect(enhancedFilterMatch([fv("Active"), fv("Closed", "exclude")], "Active")).toBe(true)
    expect(enhancedFilterMatch([fv("Active"), fv("Closed", "exclude")], "Closed")).toBe(false)
    expect(enhancedKeywordMatch([fv("cloud"), fv("legacy", "exclude")], "Cloud Platform")).toBe(true)
    expect(enhancedKeywordMatch([fv("cloud"), fv("legacy", "exclude")], "Legacy Cloud")).toBe(false)
  })

  it("converts, extracts, counts, and detects active filters", () => {
    const filters = toFilterValues(["A", "B"], "exclude")
    expect(filters).toEqual([fv("A", "exclude"), fv("B", "exclude")])
    expect(extractFilterValues(filters)).toEqual(["A", "B"])
    expect(hasActiveFilters(filters)).toBe(true)
    expect(hasActiveFilters([])).toBe(false)
    expect(countFiltersByMode([fv("A"), fv("B", "exclude")])).toEqual({ include: 1, exclude: 1 })
  })
})
