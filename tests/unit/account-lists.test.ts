import { describe, expect, it } from "vitest"
import { expandAccountLists, normalizeAccountList, unionListAccounts, withAccountLists, type AccountList } from "@/lib/accounts/account-lists"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

const list = (id: string, accounts: string[]): AccountList => ({
  id,
  user_id: "u1",
  name: `List ${id}`,
  accounts,
  unmatched: [],
  source_file: null,
  created_at: "",
  updated_at: "",
})
const lists = [list("a", ["Acme Corp", "Globex"]), list("b", ["Globex", "Initech"])]

describe("account lists", () => {
  it("normalizes rows and tolerates stringified JSON arrays", () => {
    const row = normalizeAccountList({ id: "x", name: "N", accounts: '["A","B"]', unmatched: ["", "C"], user_id: "u" })
    expect(row).toMatchObject({ id: "x", name: "N", accounts: ["A", "B"], unmatched: ["C"], user_id: "u" })
    expect(normalizeAccountList({ name: "no id" })).toBeNull()
  })

  it("unions accounts without duplicates", () => {
    expect(unionListAccounts(lists)).toEqual(["Acme Corp", "Globex", "Initech"])
  })

  it("expands selected lists into exact include and exclude names", () => {
    const filters = withAccountLists(
      createDefaultFilters(),
      [
        { value: "a", mode: "include" },
        { value: "b", mode: "exclude" },
      ],
      lists
    )
    expect(filters.accountListValues).toHaveLength(2)
    expect(filters.accountNameValues).toEqual([
      { value: "Acme Corp", mode: "include" },
      { value: "Globex", mode: "include" },
      { value: "Globex", mode: "exclude" },
      { value: "Initech", mode: "exclude" },
    ])
  })

  it("keeps stored names when every referenced list is unavailable", () => {
    const stored = createDefaultFilters({
      accountListValues: [{ value: "gone", mode: "include" }],
      accountNameValues: [{ value: "Kept Co", mode: "include" }],
    })
    expect(expandAccountLists(stored, lists).accountNameValues).toEqual([{ value: "Kept Co", mode: "include" }])
  })

  it("clears names when no list is selected", () => {
    const filters = withAccountLists(createDefaultFilters({ accountNameValues: [{ value: "Old", mode: "include" }] }), [], lists)
    expect(filters.accountNameValues).toEqual([])
  })
})
