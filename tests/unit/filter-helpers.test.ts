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
    expect(enhancedFilterMatch([], "anything")).toBe(true)
    expect(enhancedKeywordMatch([], "anything")).toBe(true)
  })

  it("supports include and exclude value filters", () => {
    const matcher = createValueMatcher([fv("India"), fv("USA", "exclude")])
    expect(matcher("India")).toBe(true)
    expect(matcher("USA")).toBe(false)
    expect(matcher("Germany")).toBe(false)
  })

  it("matches everything except excluded when only exclude value filter is used", () => {
    const matcher = createValueMatcher([fv("USA", "exclude")])
    expect(matcher("India")).toBe(true)
    expect(matcher("USA")).toBe(false)
  })

  it("allows null values only when there are no include filters", () => {
    expect(createValueMatcher([fv("India")])(null)).toBe(false)
    expect(createValueMatcher([fv("USA", "exclude")])(null)).toBe(true)
    
    expect(enhancedFilterMatch([fv("India")], null)).toBe(false)
    expect(enhancedFilterMatch([fv("USA", "exclude")], null)).toBe(true)
  })

  it("matches keyword filters case-insensitively and applies exclusions first", () => {
    const matcher = createKeywordMatcher([fv("engineer"), fv("intern", "exclude")])
    expect(matcher("Senior Engineering Leader")).toBe(true)
    expect(matcher("Engineering Intern")).toBe(false)
    expect(matcher("Sales Leader")).toBe(false)
  })

  it("matches everything except excluded when only exclude keyword filter is used", () => {
    const matcher = createKeywordMatcher([fv("intern", "exclude")])
    expect(matcher("Senior Engineering Leader")).toBe(true)
    expect(matcher("Engineering Intern")).toBe(false)
  })
  
  it("handles null value in keyword matcher properly", () => {
    const matcher = createKeywordMatcher([fv("intern", "exclude")])
    expect(matcher(null)).toBe(true)
    const matcher2 = createKeywordMatcher([fv("engineer")])
    expect(matcher2(null)).toBe(false)
  })

  it("keeps enhanced matcher behavior aligned with compiled matchers", () => {
    expect(enhancedFilterMatch([fv("Active"), fv("Closed", "exclude")], "Active")).toBe(true)
    expect(enhancedFilterMatch([fv("Active"), fv("Closed", "exclude")], "Closed")).toBe(false)
    
    // Only exclude filter matching a valid value
    expect(enhancedFilterMatch([fv("Closed", "exclude")], "Active")).toBe(true)
    
    expect(enhancedKeywordMatch([fv("cloud"), fv("legacy", "exclude")], "Cloud Platform")).toBe(true)
    expect(enhancedKeywordMatch([fv("cloud"), fv("legacy", "exclude")], "Legacy Cloud")).toBe(false)
    
    // Only exclude keyword matching a valid value
    expect(enhancedKeywordMatch([fv("legacy", "exclude")], "Modern App")).toBe(true)
    
    // Null value handling in enhancedKeywordMatch
    expect(enhancedKeywordMatch([fv("cloud")], null)).toBe(false)
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
