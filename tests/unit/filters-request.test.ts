import { describe, expect, it } from "vitest"
import {
  MAX_FILTER_KEYWORD_LENGTH,
  MAX_FILTER_KEYWORDS,
  MAX_FILTER_VALUE_LENGTH,
  MAX_FILTER_VALUES,
  parseFilters,
} from "@/lib/dashboard/filters-request"

const values = (n: number, prefix = "v") => Array.from({ length: n }, (_, i) => ({ value: `${prefix}${i}`, mode: "include" }))

describe("parseFilters", () => {
  it("keeps well-formed values and coerces modes", () => {
    const f = parseFilters({
      accountHqCountryValues: [
        { value: "India", mode: "include" },
        { value: "Japan", mode: "exclude" },
        { value: "Peru", mode: "nonsense" },
        { value: 42 },
        "not-an-object",
      ],
    })
    expect(f.accountHqCountryValues).toEqual([
      { value: "India", mode: "include" },
      { value: "Japan", mode: "exclude" },
      { value: "Peru", mode: "include" },
    ])
  })

  it("caps each value list (#294)", () => {
    const f = parseFilters({ accountNameValues: values(MAX_FILTER_VALUES + 50) })
    expect(f.accountNameValues).toHaveLength(MAX_FILTER_VALUES)
    expect(f.accountNameValues[0]).toEqual({ value: "v0", mode: "include" })
  })

  it("keeps every picked account name, since they match exactly (#308)", () => {
    // Saved filters hold up to about 900 picked names.
    const f = parseFilters({ accountGlobalLegalNameKeywords: values(1000) })
    expect(f.accountGlobalLegalNameKeywords).toHaveLength(1000)
  })

  it("allows a full uploaded account list", () => {
    // Every account in the warehouse (about 2.8K) fits under the cap.
    const f = parseFilters({ accountNameValues: values(3000) })
    expect(f.accountNameValues).toHaveLength(3000)
  })

  it("caps keyword filters harder, since each keyword becomes an ilike clause (#294)", () => {
    const f = parseFilters({
      techSoftwareInUseKeywords: values(MAX_FILTER_KEYWORDS + 10, "kw"),
      prospectTitleKeywords: values(MAX_FILTER_KEYWORDS + 10, "kw"),
    })
    expect(f.techSoftwareInUseKeywords).toHaveLength(MAX_FILTER_KEYWORDS)
    expect(f.prospectTitleKeywords).toHaveLength(MAX_FILTER_KEYWORDS)
  })

  it("drops values and keywords that are too long (#294)", () => {
    const f = parseFilters({
      accountHqCountryValues: [
        { value: "x".repeat(MAX_FILTER_VALUE_LENGTH), mode: "include" },
        { value: "x".repeat(MAX_FILTER_VALUE_LENGTH + 1), mode: "include" },
      ],
      prospectTitleKeywords: [
        { value: "y".repeat(MAX_FILTER_KEYWORD_LENGTH), mode: "include" },
        { value: "y".repeat(MAX_FILTER_KEYWORD_LENGTH + 1), mode: "include" },
      ],
    })
    expect(f.accountHqCountryValues.map((v) => v.value.length)).toEqual([MAX_FILTER_VALUE_LENGTH])
    expect(f.prospectTitleKeywords.map((v) => v.value.length)).toEqual([MAX_FILTER_KEYWORD_LENGTH])
  })

  it("leaves room for the longest values in the warehouse", () => {
    // Longest real values: prospect titles (801 chars), account names (103).
    expect(MAX_FILTER_VALUE_LENGTH).toBeGreaterThanOrEqual(801)
  })
})
