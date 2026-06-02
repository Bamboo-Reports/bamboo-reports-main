import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildServerExport } from "@/lib/exports/server-builder"
import { makeAccount, makeCenter, makeProspect, makeService } from "../fixtures/domain"

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  getProspectsPerAccountLimit: vi.fn(),
}))

vi.mock("@/lib/db/connection", () => ({
  getSqlOrThrow: () => mocks.sql,
}))

vi.mock("@/lib/config/dashboard-access", () => ({
  getProspectsPerAccountLimit: () => mocks.getProspectsPerAccountLimit(),
}))

describe("server export builder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProspectsPerAccountLimit.mockReturnValue(null)
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ")
      if (query.includes("FROM accounts")) return [makeAccount({ account_global_legal_name: "Acme Corp" })]
      if (query.includes("FROM centers")) return [makeCenter({ cn_unique_key: "CN-1" })]
      if (query.includes("FROM services")) return [makeService({ cn_unique_key: "CN-1" })]
      if (query.includes("FROM prospects")) {
        return [
          makeProspect({ account_global_legal_name: "Acme Corp", prospect_full_name: "Ada One" }),
          makeProspect({ account_global_legal_name: "Acme Corp", prospect_full_name: "Ada Two" }),
        ]
      }
      return []
    })
  })

  it("builds selected worksheets and row counts", async () => {
    const result = await buildServerExport({ datasets: ["accounts", "centers"] })
    expect(result.rowCounts).toEqual({ accounts: 1, centers: 1, services: 0, prospects: 0 })
    expect(result.totalRows).toBe(2)
    expect(result.buffer.byteLength).toBeGreaterThan(0)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Accounts", "Centers"])
  })

  it("applies the prospect access limit before writing row counts", async () => {
    mocks.getProspectsPerAccountLimit.mockReturnValue(1)
    const result = await buildServerExport({ datasets: ["prospects"] })
    expect(result.rowCounts.prospects).toBe(1)
    expect(result.totalRows).toBe(1)
  })

  it("passes precise account, center, and prospect selections into tagged queries", async () => {
    await buildServerExport({
      datasets: ["accounts", "centers", "services", "prospects"],
      accountNames: ["Acme Corp"],
      centerKeys: ["CN-1"],
      prospectKeys: ["PS-1"],
    })
    expect(mocks.sql).toHaveBeenCalledTimes(4)
    expect(mocks.sql.mock.calls.map(([strings]) => String(strings))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("account_global_legal_name = ANY"),
        expect.stringContaining("cn_unique_key = ANY"),
        expect.stringContaining("ps_unique_key = ANY"),
      ])
    )
  })

  it("targets selected keyless prospects by composite row id instead of account fallback", async () => {
    await buildServerExport({
      datasets: ["prospects"],
      accountNames: ["Acme Corp"],
      keylessProspectIds: ["Acme Corp::Ada One::Head of Ops|Ops|Bengaluru"],
    })

    expect(mocks.sql).toHaveBeenCalledTimes(1)
    const [strings, ...values] = mocks.sql.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const query = strings.join(" ")
    expect(query).toContain("ps_unique_key IS NULL")
    expect(query).toContain("CONCAT(")
    expect(query).not.toContain("account_global_legal_name = ANY")
    expect(values).toContainEqual(["Acme Corp::Ada One::Head of Ops|Ops|Bengaluru"])
    expect(values).not.toContainEqual(["Acme Corp"])
  })
})
