import { describe, expect, it } from "vitest"
import { normalizeTickerForYahoo, yahooTickerCandidates } from "@/lib/finance/tickers"

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

  it("offers both boards where a country has two that share a numbering", () => {
    expect(yahooTickerCandidates("247540", "South Korea")).toEqual(["247540.KS", "247540.KQ"])
    expect(yahooTickerCandidates("6488", "Taiwan")).toEqual(["6488.TW", "6488.TWO"])
    expect(yahooTickerCandidates("7203", "Japan")).toEqual(["7203.T"])
  })

  it("reads the country however it is written", () => {
    expect(normalizeTickerForYahoo("005930", "Korea")).toBe("005930.KS")
    expect(normalizeTickerForYahoo("005930", " Republic of Korea ")).toBe("005930.KS")
    expect(normalizeTickerForYahoo("005930", "North Korea")).toBe("005930")
  })

  it("knows the Asian exchange prefixes, and falls back to the country for one it does not", () => {
    expect(normalizeTickerForYahoo("KRX:005930")).toBe("005930.KS")
    expect(normalizeTickerForYahoo("KOSDAQ:247540")).toBe("247540.KQ")
    expect(normalizeTickerForYahoo("HKG:700")).toBe("0700.HK")
    expect(normalizeTickerForYahoo("TPEX:6488")).toBe("6488.TWO")
    expect(normalizeTickerForYahoo("XKRX:005930", "South Korea")).toBe("005930.KS")
  })

  it("places Shanghai B shares, and does not guess a board for other mainland codes", () => {
    expect(normalizeTickerForYahoo("900901", "China")).toBe("900901.SS")
    expect(normalizeTickerForYahoo("830799", "China")).toBe("830799")
  })

  it("gives nothing for a blank ticker", () => {
    expect(yahooTickerCandidates("  ")).toEqual([])
    expect(normalizeTickerForYahoo("LON:")).toBe("")
  })

  it("lets the sheet's exchange settle which company a ticker means", () => {
    expect(normalizeTickerForYahoo("BA", "United Kingdom", "LON")).toBe("BA.L")
    expect(normalizeTickerForYahoo("BA", "United States", "NYSE")).toBe("BA")
    expect(normalizeTickerForYahoo("ADM", "United Kingdom", "lon ")).toBe("ADM.L")
    expect(yahooTickerCandidates("247540", "South Korea", "KOSDAQ")).toEqual(["247540.KQ"])
    expect(normalizeTickerForYahoo("3382", "United States", "TYO")).toBe("3382.T")
  })

  it("writes share classes the way the feed does on a known exchange", () => {
    expect(normalizeTickerForYahoo("BRK.B", null, "NYSE")).toBe("BRK-B")
    expect(normalizeTickerForYahoo("MAERSK-B", null, "CPH")).toBe("MAERSK-B.CO")
    expect(normalizeTickerForYahoo("ATCO A", null, "STO")).toBe("ATCO-A.ST")
  })

  it("falls back to the old rules when the sheet gives no exchange", () => {
    expect(normalizeTickerForYahoo("7203", "Japan", "")).toBe("7203.T")
    expect(normalizeTickerForYahoo("AAPL", "United States", null)).toBe("AAPL")
  })

  it("looks nothing up for an exchange the feed does not cover", () => {
    // HPS on Casablanca: the bare ticker is a US fund, which must not be shown.
    expect(yahooTickerCandidates("HPS", "Morocco", "CSE")).toEqual([])
    expect(normalizeTickerForYahoo("SBER", "Russia", "MOEX")).toBe("SBER.ME")
  })
})
