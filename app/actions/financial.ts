"use server"

import YahooFinance from "yahoo-finance2"
import { normalizeTickerForYahoo } from "@/lib/finance/tickers"
import type { AccountFinancialInfoResponse } from "@/lib/types"

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
})

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

function getQuarterLabel(date: Date): string {
  const month = date.getUTCMonth()
  const quarter = Math.floor(month / 3) + 1
  return `Q${quarter} ${date.getUTCFullYear()}`
}

function buildRevenueSeries(
  rows: Array<{ date?: Date; totalRevenue?: number }>,
  kind: "annual" | "quarterly",
  limit: number
) {
  const mapped = rows
    .filter((row) => row.date instanceof Date && Number.isFinite(row.date.getTime()) && typeof row.totalRevenue === "number")
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())
    .slice(-limit)
    .map((row) => {
      const date = row.date as Date
      return {
        date: date.toISOString(),
        label: kind === "annual" ? `FY ${date.getUTCFullYear()}` : getQuarterLabel(date),
        revenue: row.totalRevenue as number,
      }
    })

  return mapped
}

export async function getAccountFinancialInfo(rawTicker: string): Promise<AccountFinancialInfoResponse> {
  const normalizedTicker = normalizeTickerForYahoo(rawTicker)
  if (!normalizedTicker) {
    return {
      success: false,
      error: "Ticker is missing or invalid",
      data: null,
    }
  }

  try {
    const [quote, summary, annualFinancials, quarterlyFinancials] = await Promise.all([
      yahooFinance.quote(normalizedTicker),
      yahooFinance.quoteSummary(normalizedTicker, {
        modules: ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price"],
      }),
      yahooFinance.fundamentalsTimeSeries(normalizedTicker, {
        period1: "2016-01-01",
        type: "annual",
        module: "financials",
      }),
      yahooFinance.fundamentalsTimeSeries(normalizedTicker, {
        period1: "2022-01-01",
        type: "quarterly",
        module: "financials",
      }),
    ])

    const assetProfile = summary.assetProfile
    const summaryDetail = summary.summaryDetail
    const financialData = summary.financialData
    const keyStats = summary.defaultKeyStatistics
    const price = summary.price

    const annualRevenueSeries = buildRevenueSeries(annualFinancials, "annual", 6)
    const quarterlyRevenueSeries = buildRevenueSeries(quarterlyFinancials, "quarterly", 8)

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
        marketCap: toNumber(summaryDetail?.marketCap) ?? toNumber(quote.marketCap),
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
        netProfit: toNumber(keyStats?.netIncomeToCommon),
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
        annualRevenueSeries,
        quarterlyRevenueSeries,
      },
    }
  } catch (error) {
    console.error("Error fetching financial data:", {
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
