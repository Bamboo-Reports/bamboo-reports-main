import { describe, expect, it } from "vitest"
import { extractNames, guessNameColumn, parseDelimitedText, parsePastedNames, splitDelimitedLine, tableFromRows } from "@/lib/accounts/account-list-parser"

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

  it("drops a single-column title row like the sheet's name", () => {
    const table = tableFromRows([["Accounts - Sales & Marketing"], ["Trelleborg AB"], ["Twilio Inc."]])
    expect(table.hasHeader).toBe(true)
    expect(extractNames(table, 0)).toEqual(["Trelleborg AB", "Twilio Inc."])
  })

  it("drops a single-column label header", () => {
    for (const label of ["Account name", "Company", "Accounts", "Legal name", "Customer"]) {
      expect(tableFromRows([[label], ["Infosys"], ["TCS"]]).hasHeader).toBe(true)
    }
  })

  it("keeps a real first name that only contains a label word", () => {
    for (const name of ["Acme Company", "Kraft Heinz Company", "Client Solutions Inc"]) {
      const table = tableFromRows([[name], ["Infosys"]])
      expect(table.hasHeader).toBe(false)
      expect(extractNames(table, 0)[0]).toBe(name)
    }
  })

  it("keeps commas inside pasted names", () => {
    const table = parsePastedNames("Acme Company, Inc.\nGlobex, LLC\nAmazon.com, Inc.")
    expect(table.hasHeader).toBe(false)
    expect(extractNames(table, guessNameColumn(table))).toEqual(["Acme Company, Inc.", "Globex, LLC", "Amazon.com, Inc."])
  })

  it("splits a paste from a spreadsheet on tabs and finds the name column", () => {
    const table = parsePastedNames("Country\tAccount Name\nIN\tInfosys\nUS\tAcme, Inc.")
    expect(table.hasHeader).toBe(true)
    expect(extractNames(table, guessNameColumn(table))).toEqual(["Infosys", "Acme, Inc."])
  })

  it("does not take a first row of data for a header because a name contains a label word", () => {
    const table = parseDelimitedText("Acme Company,USA\nGlobex,UK")
    expect(table.hasHeader).toBe(false)
    expect(extractNames(table, guessNameColumn(table))).toEqual(["Acme Company", "Globex"])
  })

  it("still reads real headers in a table with several columns", () => {
    for (const header of ["Account Name", "Company", "Legal entity name", "Client", "account_global_legal_name"]) {
      expect(parseDelimitedText(`${header},Country\nInfosys,IN`).hasHeader).toBe(true)
    }
  })
})
