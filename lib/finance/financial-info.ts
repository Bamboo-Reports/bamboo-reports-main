import YahooFinance from "yahoo-finance2"
import { yahooTickerCandidates } from "@/lib/finance/tickers"
import { createLogger } from "@/lib/logger"
import type { AccountFinancialInfoResponse } from "@/lib/types"

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
})
const logger = createLogger("finance/financial-info")

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function toDateIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString()
    }
  }
  return null
}

// London, Johannesburg and Tel Aviv quote prices in a minor unit (pence, cents,
// agorot) and the feed names the currency that way. Totals such as market cap
// still come in the major unit, so the major unit's rate is the one to use.
const MAJOR_UNIT: Record<string, string> = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ZAC: "ZAR", ILA: "ILS" }

/**
 * How many US dollars one unit of a currency buys, or null when that cannot
 * be said (no currency, an unknown code, or a failed lookup).
 */
async function usdRate(rawCurrency: string | null): Promise<number | null> {
  const currency = rawCurrency ? (MAJOR_UNIT[rawCurrency] ?? rawCurrency) : null
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return null
  if (currency === "USD") return 1
  try {
    const fx = await yahooFinance.quote(`${currency}USD=X`)
    const rate = toNumber(fx?.regularMarketPrice)
    return rate && rate > 0 ? rate : null
  } catch {
    return null
  }
}

/**
 * Picks the symbol the feed actually lists. A number-only ticker can belong
 * to either of a country's boards; a board that does not list it answers
 * with nothing or with an empty shell, so the first one with a market cap
 * wins and the last is the fallback.
 */
async function resolveTicker(candidates: string[]): Promise<string> {
  for (const candidate of candidates.slice(0, -1)) {
    try {
      const probe = await yahooFinance.quote(candidate)
      if (toNumber(probe?.marketCap) != null) return candidate
    } catch {
      // Not on this board: try the next.
    }
  }
  return candidates[candidates.length - 1]
}

const inUsd = (amount: number | null, rate: number | null) => (amount != null && rate != null ? amount * rate : null)

/**
 * Fetches company financials from Yahoo Finance for a ticker.
 *
 * This is a plain server-side helper with NO auth check. It must only be
 * called from an authenticated, rate-limited context (see
 * app/api/financials/route.ts). Do not expose it as a bare server action:
 * each call fans out to two Yahoo Finance requests (up to five when a ticker has to be placed on a board and currencies need converting).
 */
export async function fetchAccountFinancialInfo(rawTicker: string, hqCountry?: string | null): Promise<AccountFinancialInfoResponse> {
  const candidates = yahooTickerCandidates(rawTicker, hqCountry)
  if (candidates.length === 0) {
    return {
      success: false,
      error: "Ticker is missing or invalid",
      data: null,
    }
  }
  const normalizedTicker = await resolveTicker(candidates)

  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(normalizedTicker),
      yahooFinance.quoteSummary(normalizedTicker, {
        modules: ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price"],
      }),
    ])

    // The dashboard shows money in US dollars everywhere. The feed gives market
    // cap in the listing's currency and net profit in the company's reporting
    // currency, so both are converted, or left out when no rate is to hand.
    const quoteCurrency = toStringValue(quote.currency)
    const reportingCurrency = toStringValue(quote.financialCurrency) ?? quoteCurrency
    const [quoteRate, reportingRate] = await Promise.all([
      usdRate(quoteCurrency),
      reportingCurrency === quoteCurrency ? null : usdRate(reportingCurrency),
    ])
    const netProfitRate = reportingCurrency === quoteCurrency ? quoteRate : reportingRate

    const assetProfile = summary.assetProfile
    const summaryDetail = summary.summaryDetail
    const financialData = summary.financialData
    const keyStats = summary.defaultKeyStatistics
    const price = summary.price

    return {
      success: true,
      error: null,
      data: {
        inputTicker: rawTicker,
        normalizedTicker,
        symbol: toStringValue(quote.symbol) ?? normalizedTicker,
        exchange: toStringValue(price?.exchangeName) ?? toStringValue(quote.exchange),
        currency: toStringValue(quote.currency),
        shortName: toStringValue(quote.shortName),
        longName: toStringValue(quote.longName),
        regularMarketPrice: toNumber(quote.regularMarketPrice),
        regularMarketChange: toNumber(quote.regularMarketChange),
        regularMarketChangePercent: toNumber(quote.regularMarketChangePercent),
        regularMarketOpen: toNumber(quote.regularMarketOpen),
        regularMarketDayHigh: toNumber(quote.regularMarketDayHigh),
        regularMarketDayLow: toNumber(quote.regularMarketDayLow),
        regularMarketPreviousClose: toNumber(quote.regularMarketPreviousClose),
        regularMarketVolume: toNumber(quote.regularMarketVolume),
        averageVolume: toNumber(summaryDetail?.averageVolume),
        marketCap: inUsd(toNumber(summaryDetail?.marketCap) ?? toNumber(quote.marketCap), quoteRate),
        fiftyTwoWeekLow: toNumber(summaryDetail?.fiftyTwoWeekLow) ?? toNumber(quote.fiftyTwoWeekLow),
        fiftyTwoWeekHigh: toNumber(summaryDetail?.fiftyTwoWeekHigh) ?? toNumber(quote.fiftyTwoWeekHigh),
        trailingPE: toNumber(summaryDetail?.trailingPE) ?? toNumber(quote.trailingPE),
        forwardPE: toNumber(summaryDetail?.forwardPE),
        epsTrailingTwelveMonths: toNumber(quote.epsTrailingTwelveMonths),
        dividendYield: toNumber(summaryDetail?.dividendYield) ?? toNumber(quote.dividendYield),
        payoutRatio: toNumber(summaryDetail?.payoutRatio),
        beta: toNumber(summaryDetail?.beta),
        exDividendDate: toDateIso(summaryDetail?.exDividendDate),
        sector: toStringValue(assetProfile?.sector),
        industry: toStringValue(assetProfile?.industry),
        fullTimeEmployees: toNumber(assetProfile?.fullTimeEmployees),
        country: toStringValue(assetProfile?.country),
        website: toStringValue(assetProfile?.website),
        recommendationKey: toStringValue(financialData?.recommendationKey),
        numberOfAnalystOpinions: toNumber(financialData?.numberOfAnalystOpinions),
        targetHighPrice: toNumber(financialData?.targetHighPrice),
        targetLowPrice: toNumber(financialData?.targetLowPrice),
        targetMeanPrice: toNumber(financialData?.targetMeanPrice),
        totalRevenue: toNumber(financialData?.totalRevenue),
        netProfit: inUsd(toNumber(keyStats?.netIncomeToCommon), netProfitRate),
        ebitda: toNumber(financialData?.ebitda),
        grossMargins: toNumber(financialData?.grossMargins),
        operatingMargins: toNumber(financialData?.operatingMargins),
        profitMargins: toNumber(financialData?.profitMargins),
        freeCashflow: toNumber(financialData?.freeCashflow),
        operatingCashflow: toNumber(financialData?.operatingCashflow),
        debtToEquity: toNumber(financialData?.debtToEquity),
        returnOnAssets: toNumber(financialData?.returnOnAssets),
        returnOnEquity: toNumber(financialData?.returnOnEquity),
        enterpriseValue: toNumber(keyStats?.enterpriseValue),
        sharesOutstanding: toNumber(keyStats?.sharesOutstanding),
        heldPercentInstitutions: toNumber(keyStats?.heldPercentInstitutions),
        heldPercentInsiders: toNumber(keyStats?.heldPercentInsiders),
      },
    }
  } catch (error) {
    logger.error("financial_data_fetch_failed", {
      inputTicker: rawTicker,
      normalizedTicker,
      error,
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch financial data",
      data: null,
    }
  }
}
