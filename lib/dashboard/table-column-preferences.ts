export type TableDatasetKey = "accounts" | "centers" | "prospects"

export interface TableColumnDefinition<ColumnKey extends string = string> {
  key: ColumnKey
  label: string
  required?: boolean
}

export const TABLE_COLUMN_STORAGE_PREFIX = "br-table-columns"

export const TABLE_COLUMNS = {
  accounts: [
    { key: "name", label: "Account Name", required: true },
    { key: "industry", label: "Sub Industry" },
    { key: "revenue", label: "Revenue Range" },
    { key: "employees", label: "GCC Aggregate Headcount (India)" },
  ],
  centers: [
    { key: "name", label: "Center Name", required: true },
    { key: "location", label: "Location" },
    { key: "type", label: "Center Type" },
    { key: "employees", label: "Center Headcount" },
  ],
  prospects: [
    { key: "avatar", label: "Avatar", required: true },
    { key: "name", label: "Name", required: true },
    { key: "location", label: "Location" },
    { key: "title", label: "Job Title" },
    { key: "department", label: "Department" },
  ],
} as const satisfies Record<TableDatasetKey, readonly TableColumnDefinition[]>

export type AccountTableColumnKey = (typeof TABLE_COLUMNS.accounts)[number]["key"]
export type CenterTableColumnKey = (typeof TABLE_COLUMNS.centers)[number]["key"]
export type ProspectTableColumnKey = (typeof TABLE_COLUMNS.prospects)[number]["key"]

export type TableColumnKeyByDataset = {
  accounts: AccountTableColumnKey
  centers: CenterTableColumnKey
  prospects: ProspectTableColumnKey
}

export function getTableColumnStorageKey(dataset: TableDatasetKey): string {
  return `${TABLE_COLUMN_STORAGE_PREFIX}:${dataset}`
}
