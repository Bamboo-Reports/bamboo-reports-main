import { describe, expect, it } from "vitest"
import { extractNames, guessNameColumn, parseDelimitedText, splitDelimitedLine, tableFromRows } from "@/lib/accounts/account-list-parser"

describe("account list parser", () => {
  it("splits quoted CSV fields", () => {
    expect(splitDelimitedLine('"Acme, Inc",US,"Say ""hi"""', ",")).toEqual(["Acme, Inc", "US", 'Say "hi"'])
  })

  it("treats pasted one-per-line text as a single headerless column", () => {
    const table = parseDelimitedText("Infosys Ltd\n\nTCS\r\nInfosys Ltd\n")
    expect(table.hasHeader).toBe(false)
    expect(extractNames(table, 0)).toEqual(["Infosys Ltd", "TCS"])
  })

  it("detects a header row and picks the account column", () => {
    const table = parseDelimitedText("Country,Account Name,Revenue\nIN,Infosys,100\nUS,Acme Inc,200")
    expect(table.hasHeader).toBe(true)
    expect(table.headers).toEqual(["Country", "Account Name", "Revenue"])
    expect(guessNameColumn(table)).toBe(1)
    expect(extractNames(table, guessNameColumn(table))).toEqual(["Infosys", "Acme Inc"])
  })

  it("prefers a text-heavy column when there is no header", () => {
    const table = tableFromRows([
      ["1", "Infosys", "https://infosys.com"],
      ["2", "TCS", "https://tcs.com"],
    ])
    expect(table.hasHeader).toBe(false)
    expect(guessNameColumn(table)).toBe(1)
  })

  it("handles tab separated input and BOM", () => {
    const table = parseDelimitedText("﻿Company\tCity\nInfosys\tBengaluru")
    expect(table.headers).toEqual(["Company", "City"])
    expect(extractNames(table, 0)).toEqual(["Infosys"])
  })
})
