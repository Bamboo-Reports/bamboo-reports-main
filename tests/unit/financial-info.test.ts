import { beforeEach, describe, expect, it, vi } from "vitest"

const feed = vi.hoisted(() => ({
  quote: vi.fn(),
  quoteSummary: vi.fn(),
}))

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = feed.quote
    quoteSummary = feed.quoteSummary
  },
}))
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))

import { fetchAccountFinancialInfo } from "@/lib/finance/financial-info"

type Listing = { currency: string; financialCurrency?: string; marketCap?: number; netIncome?: number }

/** Sets up the feed: listings by symbol and FX rates by pair ("JPYUSD=X"). Anything else is "not found". */
function serve(listings: Record<string, Listing>, rates: Record<string, number> = {}) {
  feed.quote.mockImplementation(async (symbol: string) => {
    if (symbol in rates) return { symbol, regularMarketPrice: rates[symbol] }
    const listing = listings[symbol]
    if (!listing) throw new Error(`Quote not found for symbol: ${symbol}`)
    return { symbol, currency: listing.currency, financialCurrency: listing.financialCurrency, marketCap: listing.marketCap }
  })
  feed.quoteSummary.mockImplementation(async (symbol: string) => {
    const listing = listings[symbol]
    if (!listing) throw new Error(`Quote not found for symbol: ${symbol}`)
    return {
      summaryDetail: { marketCap: listing.marketCap },
      defaultKeyStatistics: { netIncomeToCommon: listing.netIncome },
    }
  })
}

beforeEach(() => {
  feed.quote.mockReset()
  feed.quoteSummary.mockReset()
})

describe("fetchAccountFinancialInfo", () => {
  it("leaves US dollar figures alone and asks for no rate", async () => {
    serve({ MSFT: { currency: "USD", financialCurrency: "USD", marketCap: 3000, netIncome: 100 } })
    const { data } = await fetchAccountFinancialInfo("MSFT", "United States")
    expect(data).toMatchObject({ marketCap: 3000, netProfit: 100 })
    expect(feed.quote).toHaveBeenCalledTimes(1)
  })

  it("converts a listing and its profit from the local currency", async () => {
    serve({ "7203.T": { currency: "JPY", financialCurrency: "JPY", marketCap: 40_000, netIncome: 4_000 } }, { "JPYUSD=X": 0.01 })
    const { data } = await fetchAccountFinancialInfo("7203", "Japan")
    expect(data?.normalizedTicker).toBe("7203.T")
    expect(data?.marketCap).toBeCloseTo(400)
    expect(data?.netProfit).toBeCloseTo(40)
  })

  it("converts only the profit of a US listing that reports in another currency", async () => {
    serve({ SAP: { currency: "USD", financialCurrency: "EUR", marketCap: 270, netIncome: 8 } }, { "EURUSD=X": 1.1 })
    const { data } = await fetchAccountFinancialInfo("SAP", "Germany")
    expect(data?.marketCap).toBe(270)
    expect(data?.netProfit).toBeCloseTo(8.8)
  })

  it("converts the market cap of a listing priced in pence at the pound's rate", async () => {
    serve({ "HSBA.L": { currency: "GBp", financialCurrency: "USD", marketCap: 230, netIncome: 26 } }, { "GBPUSD=X": 1.3 })
    const { data } = await fetchAccountFinancialInfo("LON:HSBA", "United Kingdom")
    expect(data?.marketCap).toBeCloseTo(299)
    expect(data?.netProfit).toBe(26)
  })

  it("leaves a figure out when no rate is to be had, rather than showing it unconverted", async () => {
    serve({ "7203.T": { currency: "JPY", financialCurrency: "JPY", marketCap: 40_000, netIncome: 4_000 } })
    const { success, data } = await fetchAccountFinancialInfo("7203", "Japan")
    expect(success).toBe(true)
    expect(data).toMatchObject({ marketCap: null, netProfit: null })
  })

  it("finds a number-only ticker on a country's second board", async () => {
    serve({ "247540.KQ": { currency: "KRW", financialCurrency: "KRW", marketCap: 1000, netIncome: 100 } }, { "KRWUSD=X": 0.001 })
    const { data } = await fetchAccountFinancialInfo("247540", "South Korea")
    expect(data?.normalizedTicker).toBe("247540.KQ")
    expect(data?.marketCap).toBeCloseTo(1)
  })

  it("skips a board that answers with an empty shell", async () => {
    serve(
      {
        "247540.KS": { currency: "KRW" },
        "247540.KQ": { currency: "KRW", financialCurrency: "KRW", marketCap: 1000, netIncome: 100 },
      },
      { "KRWUSD=X": 0.001 }
    )
    const { data } = await fetchAccountFinancialInfo("247540", "South Korea")
    expect(data?.normalizedTicker).toBe("247540.KQ")
  })

  it("reports a ticker the feed does not know", async () => {
    serve({})
    const result = await fetchAccountFinancialInfo("NOPE", "United States")
    expect(result).toMatchObject({ success: false, data: null })
  })
})
