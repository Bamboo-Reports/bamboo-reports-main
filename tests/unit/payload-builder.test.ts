import { describe, expect, it } from "vitest"
import { buildExportPayload } from "@/lib/exports/payload-builder"
import type { ExportScope } from "@/lib/exports/payload-builder"
import { makeFilters } from "../fixtures/domain"

describe("buildExportPayload", () => {
  const defaultFilters = makeFilters()
  const filteredData = {
    filteredAccounts: [{ account_global_legal_name: "Acme Corp" }, { account_global_legal_name: "Beta LLC" }] as any[],
    filteredCenters: [{ cn_unique_key: "CN-1" }, { cn_unique_key: "CN-2" }] as any[],
    filteredServices: [{ cn_unique_key: "CN-1" }, { cn_unique_key: "CN-2" }] as any[],
    filteredProspects: [
      { ps_unique_key: "PS-1", account_global_legal_name: "Acme Corp", prospect_full_name: "Ada" },
      { ps_unique_key: "PS-2", account_global_legal_name: "Acme Corp", prospect_full_name: "Bob" },
    ] as any[],
  }

  describe("full export (no scope)", () => {
    it("returns all filtered data when exportScope is null", () => {
      const result = buildExportPayload({
        exportScope: null,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.accounts).toHaveLength(2)
      expect(result.data.centers).toHaveLength(2)
      expect(result.data.services).toHaveLength(2)
      expect(result.data.prospects).toHaveLength(2)
      expect(result.isFiltered).toBe(false)
      expect(result.accountNames).toEqual(["Acme Corp", "Beta LLC"])
      expect(result.centerKeys).toEqual(["CN-1", "CN-2"])
      expect(result.allowedDatasets).toBeUndefined()
    })

    it("marks as filtered when activeFiltersCount > 0", () => {
      const result = buildExportPayload({
        exportScope: null,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 3,
      })
      expect(result.isFiltered).toBe(true)
    })

    it("deduplicates account names", () => {
      const data = {
        ...filteredData,
        filteredAccounts: [
          { account_global_legal_name: "Acme Corp" },
          { account_global_legal_name: "Acme Corp" },
        ] as any[],
      }
      const result = buildExportPayload({
        exportScope: null,
        filteredData: data,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.accountNames).toEqual(["Acme Corp"])
    })
  })

  describe("centers scope", () => {
    const scope: ExportScope = { dataset: "centers", centerKeys: ["CN-1"] }

    it("filters centers by selected keys", () => {
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.centers).toHaveLength(1)
      expect(result.data.centers[0].cn_unique_key).toBe("CN-1")
      expect(result.data.accounts).toHaveLength(0)
      expect(result.data.prospects).toHaveLength(0)
      expect(result.isFiltered).toBe(true)
      expect(result.allowedDatasets).toEqual(["centers"])
    })

    it("returns empty centers when no keys match", () => {
      const scope: ExportScope = { dataset: "centers", centerKeys: ["CN-NONEXISTENT"] }
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.centers).toHaveLength(0)
    })
  })

  describe("prospects scope", () => {
    const scope: ExportScope = { dataset: "prospects", prospectIds: ["PS-1"] }

    it("filters prospects with ps_unique_key", () => {
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.prospects).toHaveLength(1)
      expect(result.data.prospects[0].prospect_full_name).toBe("Ada")
      expect(result.prospectKeys).toEqual(["PS-1"])
      expect(result.allowedDatasets).toEqual(["prospects"])
    })

    it("handles keyless prospects via fallback", () => {
      const data = {
        ...filteredData,
        filteredProspects: [
          { account_global_legal_name: "Acme Corp", prospect_full_name: "Charlie", ps_unique_key: null },
        ] as any[],
      }
      const result = buildExportPayload({
        exportScope: { dataset: "prospects", prospectIds: ["Acme Corp::Charlie::"] },
        filteredData: data,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.prospects).toHaveLength(1)
      expect(result.keylessProspectIds).toHaveLength(1)
      expect(result.accountNames).toHaveLength(0)
    })

    it("returns empty prospects when no ids match", () => {
      const scope: ExportScope = { dataset: "prospects", prospectIds: ["PS-NONEXISTENT"] }
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.prospects).toHaveLength(0)
    })
  })

  describe("accounts scope", () => {
    const scope: ExportScope = { dataset: "accounts", accountNames: ["Acme Corp"] }

    it("filters accounts by selected names", () => {
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.accounts).toHaveLength(1)
      expect(result.data.accounts[0].account_global_legal_name).toBe("Acme Corp")
      expect(result.data.centers).toHaveLength(0)
      expect(result.isFiltered).toBe(true)
      expect(result.allowedDatasets).toEqual(["accounts"])
    })

    it("returns empty accounts when no names match", () => {
      const scope: ExportScope = { dataset: "accounts", accountNames: ["NONEXISTENT"] }
      const result = buildExportPayload({
        exportScope: scope,
        filteredData,
        filters: defaultFilters,
        activeFiltersCount: 0,
      })
      expect(result.data.accounts).toHaveLength(0)
    })
  })

  it("includes filtersSnapshot with selection for scoped exports", () => {
    const scope: ExportScope = { dataset: "accounts", accountNames: ["Acme Corp"] }
    const result = buildExportPayload({
      exportScope: scope,
      filteredData,
      filters: defaultFilters,
      activeFiltersCount: 0,
    })
    expect(result.filtersSnapshot).toHaveProperty("selection", scope)
  })

  it("includes raw filters as snapshot for full export", () => {
    const result = buildExportPayload({
      exportScope: null,
      filteredData,
      filters: defaultFilters,
      activeFiltersCount: 0,
    })
    expect(result.filtersSnapshot).toEqual(defaultFilters)
  })
})
