export type RowRecord = Record<string, unknown>
export type ExportDatasetKey = "accounts" | "centers" | "services" | "prospects"

export type ExportSelection = Partial<Record<ExportDatasetKey, RowRecord[]>>
export type ExportProgressHandler = (progress: number, stage?: string) => void
