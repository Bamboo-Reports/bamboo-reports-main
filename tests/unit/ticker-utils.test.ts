import { describe, expect, it } from "vitest"
import { normalizeTickerForYahoo } from "@/lib/finance/tickers"

describe("normalizeTickerForYahoo", () => {
  it("returns the raw ticker when no exchange is present", () => {
    expect(normalizeTickerForYahoo("AAPL")).toBe("AAPL")
  })

  it("appends .T for TYO exchange", () => {
    expect(normalizeTickerForYahoo("TYO:SONY")).toBe("SONY.T")
  })

  it("appends .ST for STO exchange", () => {
    expect(normalizeTickerForYahoo("STO:ERIC")).toBe("ERIC.ST")
  })

  it("appends .SW for SWX exchange", () => {
    expect(normalizeTickerForYahoo("SWX:NOVN")).toBe("NOVN.SW")
  })

  it("appends .CO for CPH exchange", () => {
    expect(normalizeTickerForYahoo("CPH:NOVO")).toBe("NOVO.CO")
  })

  it("appends .L for LON exchange", () => {
    expect(normalizeTickerForYahoo("LON:BP")).toBe("BP.L")
  })

  it("appends .PA for EPA exchange", () => {
    expect(normalizeTickerForYahoo("EPA:MC")).toBe("MC.PA")
  })

  it("handles whitespace in ticker input", () => {
    expect(normalizeTickerForYahoo("  TYO:SONY  ")).toBe("SONY.T")
  })

  it("handles lowercase exchange and symbol", () => {
    expect(normalizeTickerForYahoo("tyo:sony")).toBe("SONY.T")
  })

  it("returns empty string for empty input", () => {
    expect(normalizeTickerForYahoo("")).toBe("")
  })

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeTickerForYahoo("   ")).toBe("")
  })

  it("handles symbol without exchange prefix", () => {
    expect(normalizeTickerForYahoo("MSFT")).toBe("MSFT")
  })

  it("returns symbol only for unknown exchange", () => {
    expect(normalizeTickerForYahoo("UNKNOWN:SYMBOL")).toBe("SYMBOL")
  })
})
