import { describe, expect, it } from "vitest"
import { FILTER_METADATA, getFilterMetadata, getFilterMetadataProperties } from "@/lib/analytics/filter-metadata"
import type { Filters } from "@/lib/types"

describe("FILTER_METADATA", () => {
  const metadataKeys = Object.keys(FILTER_METADATA) as Array<keyof Filters>

  it("covers all filter keys from the Filters type", () => {
    expect(metadataKeys.length).toBeGreaterThan(0)
  })

  it("every entry has a label, group, and inputType", () => {
    for (const key of metadataKeys) {
      const entry = FILTER_METADATA[key]
      expect(entry.label).toBeTruthy()
      expect(entry.group).toMatch(/^(account|center|prospect)$/)
      expect(entry.inputType).toMatch(/^(segmented_control|multi_select|keyword|range|toggle)$/)
    }
  })

  it("groups filters correctly", () => {
    const accountFilters = metadataKeys.filter((k) => FILTER_METADATA[k].group === "account")
    const centerFilters = metadataKeys.filter((k) => FILTER_METADATA[k].group === "center")
    const prospectFilters = metadataKeys.filter((k) => FILTER_METADATA[k].group === "prospect")

    expect(accountFilters.length).toBeGreaterThan(centerFilters.length)
    expect(centerFilters.length).toBeGreaterThan(prospectFilters.length)
  })
})

describe("getFilterMetadata", () => {
  it("returns metadata for a known filter", () => {
    const meta = getFilterMetadata("accountVisibilityMode")
    expect(meta?.label).toBe("Account Visibility")
    expect(meta?.group).toBe("account")
    expect(meta?.inputType).toBe("segmented_control")
  })

  it("returns metadata for center filters", () => {
    const meta = getFilterMetadata("centerTypeValues")
    expect(meta?.label).toBe("Center Type")
    expect(meta?.group).toBe("center")
    expect(meta?.inputType).toBe("multi_select")
  })

  it("returns metadata for prospect filters", () => {
    const meta = getFilterMetadata("prospectDepartmentValues")
    expect(meta?.label).toBe("Department")
    expect(meta?.group).toBe("prospect")
    expect(meta?.inputType).toBe("multi_select")
  })
})

describe("getFilterMetadataProperties", () => {
  it("returns flattened properties for analytics", () => {
    const props = getFilterMetadataProperties("accountHqRevenueRange")
    expect(props).toEqual({
      filter_name: "HQ Company Revenue",
      filter_group: "account",
      filter_input_type: "range",
    })
  })

  it("returns properties for keyword filters", () => {
    const props = getFilterMetadataProperties("prospectTitleKeywords")
    expect(props).toEqual({
      filter_name: "Job Title",
      filter_group: "prospect",
      filter_input_type: "keyword",
    })
  })
})
