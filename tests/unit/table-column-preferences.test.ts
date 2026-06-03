import { describe, expect, it } from "vitest"
import {
  TABLE_COLUMNS,
  TABLE_COLUMN_STORAGE_PREFIX,
  getTableColumnStorageKey,
} from "@/lib/dashboard/table-column-preferences"

describe("TABLE_COLUMNS", () => {
  it("defines columns for all three datasets", () => {
    expect(TABLE_COLUMNS.accounts.length).toBeGreaterThan(0)
    expect(TABLE_COLUMNS.centers.length).toBeGreaterThan(0)
    expect(TABLE_COLUMNS.prospects.length).toBeGreaterThan(0)
  })

  it("each dataset has at least one required column", () => {
    for (const dataset of Object.keys(TABLE_COLUMNS) as Array<keyof typeof TABLE_COLUMNS>) {
      expect(TABLE_COLUMNS[dataset].some((col) => "required" in col && col.required)).toBe(true)
    }
  })

  it("accounts columns have the correct structure", () => {
    const accountCols = TABLE_COLUMNS.accounts
    const nameCol = accountCols.find((c) => c.key === "name")!
    expect(nameCol).toBeDefined()
    expect(nameCol.label).toBe("Account Name")
    expect("required" in nameCol && nameCol.required).toBe(true)

    const industryCol = accountCols.find((c) => c.key === "industry")!
    expect(industryCol).toBeDefined()
    expect(industryCol.label).toBe("Sub Industry")
    expect("required" in industryCol).toBe(false)
  })

  it("centers columns have the correct structure", () => {
    const centerCols = TABLE_COLUMNS.centers
    expect(centerCols.find((c) => c.key === "name")?.label).toBe("Center Name")
    expect(centerCols.find((c) => c.key === "location")?.label).toBe("Location")
    expect(centerCols.find((c) => c.key === "type")?.label).toBe("Center Type")
    expect(centerCols.find((c) => c.key === "employees")?.label).toBe("Center Headcount")
  })

  it("prospects columns have the correct structure", () => {
    const prospectCols = TABLE_COLUMNS.prospects
    expect(prospectCols.find((c) => c.key === "avatar")?.label).toBe("Avatar")
    expect(prospectCols.find((c) => c.key === "name")?.label).toBe("Name")
    expect(prospectCols.find((c) => c.key === "location")?.label).toBe("Location")
    expect(prospectCols.find((c) => c.key === "title")?.label).toBe("Job Title")
    expect(prospectCols.find((c) => c.key === "department")?.label).toBe("Department")
  })

  it("required columns are marked required", () => {
    const accountName = TABLE_COLUMNS.accounts.find((c) => c.key === "name")!
    const centerName = TABLE_COLUMNS.centers.find((c) => c.key === "name")!
    const prospectAvatar = TABLE_COLUMNS.prospects.find((c) => c.key === "avatar")!
    const prospectName = TABLE_COLUMNS.prospects.find((c) => c.key === "name")!
    expect("required" in accountName && accountName.required).toBe(true)
    expect("required" in centerName && centerName.required).toBe(true)
    expect("required" in prospectAvatar && prospectAvatar.required).toBe(true)
    expect("required" in prospectName && prospectName.required).toBe(true)
  })
})

describe("TABLE_COLUMN_STORAGE_PREFIX", () => {
  it("is set to br-table-columns", () => {
    expect(TABLE_COLUMN_STORAGE_PREFIX).toBe("br-table-columns")
  })
})

describe("getTableColumnStorageKey", () => {
  it("generates storage key for accounts", () => {
    expect(getTableColumnStorageKey("accounts")).toBe("br-table-columns:accounts")
  })

  it("generates storage key for centers", () => {
    expect(getTableColumnStorageKey("centers")).toBe("br-table-columns:centers")
  })

  it("generates storage key for prospects", () => {
    expect(getTableColumnStorageKey("prospects")).toBe("br-table-columns:prospects")
  })
})
