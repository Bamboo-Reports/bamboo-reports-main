import { describe, expect, it } from "vitest"

import { mergeTickersIntoAccounts } from "@/lib/dashboard/ticker-merge"
import { makeAccount } from "../fixtures/domain"

describe("mergeTickersIntoAccounts", () => {
  it("attaches the ticker matching on account_global_legal_name", () => {
    const accounts = [
      makeAccount({ account_global_legal_name: "Acme Corp" }),
      makeAccount({ account_global_legal_name: "Globex Inc" }),
    ]
    const tickers = [
      { account_global_legal_name: "Acme Corp", account_hq_stock_ticker: "ACME" },
      { account_global_legal_name: "Globex Inc", account_hq_stock_ticker: "GLBX" },
    ]

    const merged = mergeTickersIntoAccounts(accounts, tickers)

    expect(merged[0].account_hq_stock_ticker).toBe("ACME")
    expect(merged[1].account_hq_stock_ticker).toBe("GLBX")
  })

  it("sets null when an account has no ticker row", () => {
    const accounts = [makeAccount({ account_global_legal_name: "Acme Corp" })]

    const merged = mergeTickersIntoAccounts(accounts, [
      { account_global_legal_name: "Someone Else", account_hq_stock_ticker: "SE" },
    ])

    expect(merged[0].account_hq_stock_ticker).toBeNull()
  })

  it("returns accounts with null tickers when the ticker table is empty", () => {
    const accounts = [makeAccount({ account_global_legal_name: "Acme Corp" })]

    const merged = mergeTickersIntoAccounts(accounts, [])

    expect(merged).toHaveLength(1)
    expect(merged[0].account_hq_stock_ticker).toBeNull()
  })

  it("does not mutate the input accounts", () => {
    const account = makeAccount({ account_global_legal_name: "Acme Corp" })

    mergeTickersIntoAccounts([account], [
      { account_global_legal_name: "Acme Corp", account_hq_stock_ticker: "ACME" },
    ])

    expect(account.account_hq_stock_ticker).toBeUndefined()
  })
})
