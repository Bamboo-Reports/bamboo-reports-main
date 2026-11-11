// Exchange prefixes ("TYO:7203") and the suffix the market data feed uses for them.
const YAHOO_EXCHANGE_SUFFIXES: Record<string, string> = {
  TYO: ".T",
  STO: ".ST",
  SWX: ".SW",
  CPH: ".CO",
  LON: ".L",
  EPA: ".PA",
  KRX: ".KS",
  KOSDAQ: ".KQ",
  HKG: ".HK",
  HKEX: ".HK",
  SEHK: ".HK",
  TPE: ".TW",
  TWSE: ".TW",
  TPEX: ".TWO",
  SHA: ".SS",
  SSE: ".SS",
  SHE: ".SZ",
  SZSE: ".SZ",
  TADAWUL: ".SR",
}

// Hong Kong codes are four digits on the feed ("01070" is 1070.HK, "992" is 0992.HK).
const withSuffix = (symbol: string, suffix: string) =>
  suffix === ".HK" && /^\d+$/.test(symbol) ? `${symbol.replace(/^0+/, "").padStart(4, "0")}${suffix}` : `${symbol}${suffix}`

/**
 * Exchanges that list by number. A number-only ticker carries no exchange, so
 * the account's HQ country says where to look. A country with two boards that
 * share a numbering (KOSPI and KOSDAQ, the Taiwan exchange and its OTC market)
 * gives both, main board first; the caller uses the first one the feed knows.
 */
function suffixesForNumericTicker(symbol: string, hqCountry: string): string[] {
  const country = hqCountry.trim().toLowerCase()
  if (country === "japan") return [".T"]
  if (country.includes("korea") && !country.includes("north")) return [".KS", ".KQ"]
  if (country.startsWith("taiwan")) return [".TW", ".TWO"]
  if (country === "saudi arabia") return [".SR"]
  if (country.startsWith("hong kong")) return [".HK"]
  if (country === "china") {
    // Shorter codes trade in Hong Kong. Six digits are mainland listings:
    // Shanghai starts with 6 (A shares) or 9 (B shares), Shenzhen with 0, 2 or 3.
    if (symbol.length !== 6) return [".HK"]
    if (/^[69]/.test(symbol)) return [".SS"]
    if (/^[023]/.test(symbol)) return [".SZ"]
  }
  return []
}

/**
 * The symbols to try on the market data feed for a stored ticker, most likely
 * first. Usually one; two when a number-only ticker could sit on either of a
 * country's boards. Empty when the ticker is blank.
 */
export function yahooTickerCandidates(rawTicker: string, hqCountry?: string | null): string[] {
  const trimmed = rawTicker.trim()
  if (!trimmed) return []

  const [exchangePart, symbolPart] = trimmed.includes(":") ? trimmed.split(":", 2) : ["", trimmed]
  const exchange = exchangePart.trim().toUpperCase()
  const symbol = symbolPart.trim().toUpperCase()
  if (!symbol) return []

  const suffix = YAHOO_EXCHANGE_SUFFIXES[exchange]
  if (suffix) return [withSuffix(symbol, suffix)]

  // No prefix, or one this table does not know: the country can still place a number.
  if (hqCountry && /^\d+$/.test(symbol)) {
    const suffixes = suffixesForNumericTicker(symbol, hqCountry)
    if (suffixes.length > 0) return suffixes.map((numericSuffix) => withSuffix(symbol, numericSuffix))
  }

  return [symbol]
}

/** The most likely feed symbol for a stored ticker ("" when blank). */
export function normalizeTickerForYahoo(rawTicker: string, hqCountry?: string | null): string {
  return yahooTickerCandidates(rawTicker, hqCountry)[0] ?? ""
}
