import type { Account, Center, Filters, Prospect } from "@/lib/types"
import type { ExportDatasetKey } from "@/lib/utils/export-helpers"
import { getProspectRecordId } from "@/lib/dashboard/prospect-id"

export type ExportScope =
  | { dataset: "accounts"; accountNames: string[] }
  | { dataset: "centers"; centerKeys: string[] }
  | { dataset: "prospects"; prospectIds: string[] }
  | null

export interface ExportPayload {
  data: {
    accounts: Account[]
    centers: Center[]
    services: { cn_unique_key: string | null }[]
    prospects: Prospect[]
  }
  isFiltered: boolean
  filtersSnapshot: unknown
  accountNames: string[]
  centerKeys: string[]
  prospectKeys: string[] | undefined
  keylessProspectIds: string[] | undefined
  allowedDatasets: ExportDatasetKey[] | undefined
}

interface FilteredData {
  filteredAccounts: Account[]
  filteredCenters: Center[]
  filteredServices: { cn_unique_key: string | null }[]
  filteredProspects: Prospect[]
}

interface BuildExportPayloadParams {
  exportScope: ExportScope
  filteredData: FilteredData
  filters: Filters
  activeFiltersCount: number
}

export function buildExportPayload(params: BuildExportPayloadParams): ExportPayload {
  const { exportScope, filteredData, filters, activeFiltersCount } = params
  const { filteredAccounts, filteredCenters, filteredServices, filteredProspects } = filteredData

  if (!exportScope) {
    return {
      data: {
        accounts: filteredAccounts,
        centers: filteredCenters,
        services: filteredServices,
        prospects: filteredProspects,
      },
      isFiltered: activeFiltersCount > 0,
      filtersSnapshot: filters,
      accountNames: Array.from(
        new Set(
          filteredAccounts.map((a) => a.account_global_legal_name).filter((name): name is string => Boolean(name))
        )
      ),
      centerKeys: Array.from(
        new Set(filteredCenters.map((c) => c.cn_unique_key).filter((key): key is string => Boolean(key)))
      ),
      prospectKeys: undefined,
      keylessProspectIds: undefined,
      allowedDatasets: undefined,
    }
  }

  const emptyData = {
    accounts: [] as Account[],
    centers: [] as Center[],
    services: [] as { cn_unique_key: string | null }[],
    prospects: [] as Prospect[],
  }
  const snapshot = { ...(filters as object), selection: exportScope }

  if (exportScope.dataset === "centers") {
    const keySet = new Set(exportScope.centerKeys)
    const scopedCenters = filteredCenters.filter((c) => c.cn_unique_key && keySet.has(c.cn_unique_key))
    return {
      data: { ...emptyData, centers: scopedCenters },
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: [],
      centerKeys: exportScope.centerKeys,
      prospectKeys: undefined,
      keylessProspectIds: undefined,
      allowedDatasets: ["centers"],
    }
  }

  if (exportScope.dataset === "prospects") {
    const idSet = new Set(exportScope.prospectIds)
    const scopedProspects = filteredProspects.filter((p) => idSet.has(getProspectRecordId(p)))
    const prospectKeys = Array.from(
      new Set(scopedProspects.map((p) => p.ps_unique_key).filter((key): key is string => Boolean(key)))
    )
    const fallbackAccountNames = Array.from(
      new Set(
        scopedProspects
          .filter((p) => !p.ps_unique_key)
          .map((p) => p.account_global_legal_name)
          .filter((name): name is string => Boolean(name))
      )
    )
    const keylessProspectIds = Array.from(
      new Set(scopedProspects.filter((p) => !p.ps_unique_key).map(getProspectRecordId))
    )
    return {
      data: { ...emptyData, prospects: scopedProspects },
      isFiltered: true,
      filtersSnapshot: snapshot,
      accountNames: keylessProspectIds.length > 0 ? [] : fallbackAccountNames,
      centerKeys: [],
      prospectKeys,
      keylessProspectIds,
      allowedDatasets: ["prospects"],
    }
  }

  const nameSet = new Set(exportScope.accountNames)
  const scopedAccounts = filteredAccounts.filter(
    (a) => a.account_global_legal_name && nameSet.has(a.account_global_legal_name)
  )
  return {
    data: { ...emptyData, accounts: scopedAccounts },
    isFiltered: true,
    filtersSnapshot: snapshot,
    accountNames: exportScope.accountNames,
    centerKeys: [],
    prospectKeys: undefined,
    keylessProspectIds: undefined,
    allowedDatasets: ["accounts"],
  }
}
