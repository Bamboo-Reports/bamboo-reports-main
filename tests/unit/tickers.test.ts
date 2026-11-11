import { describe, expect, it } from "vitest"
import { normalizeTickerForYahoo } from "@/lib/finance/tickers"

describe("normalizeTickerForYahoo", () => {
  it("leaves lettered tickers alone and honours an exchange prefix", () => {
    expect(normalizeTickerForYahoo("sap", "Germany")).toBe("SAP")
    expect(normalizeTickerForYahoo("TYO:7203")).toBe("7203.T")
  })

  it("uses the HQ country to place a number-only ticker on its exchange", () => {
    expect(normalizeTickerForYahoo("7203", "Japan")).toBe("7203.T")
    expect(normalizeTickerForYahoo("005930", "South Korea")).toBe("005930.KS")
    expect(normalizeTickerForYahoo("2330", "Taiwan")).toBe("2330.TW")
    expect(normalizeTickerForYahoo("600031", "China")).toBe("600031.SS")
    expect(normalizeTickerForYahoo("000063", "China")).toBe("000063.SZ")
    expect(normalizeTickerForYahoo("9988", "China")).toBe("9988.HK")
    expect(normalizeTickerForYahoo("01070", "Hong Kong")).toBe("1070.HK")
  })

  it("does not guess for a number-only ticker without a known country", () => {
    expect(normalizeTickerForYahoo("3036", "Canada")).toBe("3036")
    expect(normalizeTickerForYahoo("7203")).toBe("7203")
  })
})
