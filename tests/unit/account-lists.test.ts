import { describe, expect, it } from "vitest"
import { expandAccountLists, mapUnmatchedName, normalizeAccountList, unionListAccounts, withAccountLists, type AccountList } from "@/lib/accounts/account-lists"
import { createDefaultFilters } from "@/lib/dashboard/defaults"

const list = (id: string, accounts: string[]): AccountList => ({
  id,
  user_id: "u1",
  name: `List ${id}`,
  accounts,
  unmatched: [],
  matches: [],
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

  it("keeps stored names for a list that is not to hand while refreshing the known one", () => {
    // The stored names came from both lists; "b" is not in this context yet.
    const stored = createDefaultFilters({
      accountListValues: [
        { value: "a", mode: "include" },
        { value: "new", mode: "include" },
      ],
      accountNameValues: [
        { value: "Acme Corp", mode: "include" },
        { value: "Fresh Co", mode: "include" },
      ],
    })
    expect(expandAccountLists(stored, lists).accountNameValues).toEqual(
      expect.arrayContaining([
        { value: "Acme Corp", mode: "include" },
        { value: "Fresh Co", mode: "include" },
      ])
    )
  })

  it("clears names when no list is selected", () => {
    const filters = withAccountLists(createDefaultFilters({ accountNameValues: [{ value: "Old", mode: "include" }] }), [], lists)
    expect(filters.accountNameValues).toEqual([])
  })
})

describe("account list matches", () => {
  it("reads uploaded names and how they matched, dropping malformed entries", () => {
    const parsed = normalizeAccountList({
      id: "l1",
      name: "L",
      matches: [
        { input: "AB InBev", account: "Anheuser-Busch InBev", via: "alias" },
        { input: "Acme Holdings", account: null, via: "none" },
        { input: "Shell", account: "Shell plc", via: "something new" },
        { input: "Ghost", account: null, via: "alias" },
        { input: "", account: "X", via: "exact" },
        "junk",
      ],
    })
    expect(parsed?.matches).toEqual([
      { input: "AB InBev", account: "Anheuser-Busch InBev", via: "alias" },
      { input: "Acme Holdings", account: null, via: "none" },
      { input: "Shell", account: "Shell plc", via: "exact" },
      { input: "Ghost", account: null, via: "none" },
    ])
  })

  it("defaults to no matches for lists saved before they were recorded", () => {
    expect(normalizeAccountList({ id: "l1", name: "L" })?.matches).toEqual([])
  })

  it("maps an unmatched name to an account", () => {
    const before: AccountList = {
      ...list("a", ["Shell plc"]),
      unmatched: ["Acme Holdings"],
      matches: [
        { input: "Shell", account: "Shell plc", via: "suffix" },
        { input: "Acme Holdings", account: null, via: "none" },
      ],
    }
    expect(mapUnmatchedName(before, "Acme Holdings", "Acme Corp")).toEqual({
      accounts: ["Shell plc", "Acme Corp"],
      unmatched: [],
      matches: [
        { input: "Shell", account: "Shell plc", via: "suffix" },
        { input: "Acme Holdings", account: "Acme Corp", via: "manual" },
      ],
    })
  })

  it("does not add an account twice when mapping to one already in the list", () => {
    const before: AccountList = { ...list("a", ["Shell plc"]), unmatched: ["Royal Dutch"], matches: [{ input: "Royal Dutch", account: null, via: "none" }] }
    expect(mapUnmatchedName(before, "Royal Dutch", "shell PLC").accounts).toEqual(["Shell plc"])
  })
})
