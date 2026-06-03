import { describe, expect, it } from "vitest"
import { getFilterMetadata, getFilterMetadataProperties, FILTER_METADATA } from "@/lib/analytics/filter-metadata"

describe("filter metadata", () => {
  it("returns metadata from getFilterMetadata", () => {
    expect(getFilterMetadata("accountVisibilityMode")).toEqual(FILTER_METADATA.accountVisibilityMode)
  })

  it("returns properly formatted properties from getFilterMetadataProperties", () => {
    const props = getFilterMetadataProperties("accountVisibilityMode")
    expect(props).toEqual({
      filter_name: "Account Visibility",
      filter_group: "account",
      filter_input_type: "segmented_control",
    })
  })

  it("works for another filter", () => {
    const props = getFilterMetadataProperties("centerStatusValues")
    expect(props).toEqual({
      filter_name: "Status",
      filter_group: "center",
      filter_input_type: "multi_select",
    })
  })
})
