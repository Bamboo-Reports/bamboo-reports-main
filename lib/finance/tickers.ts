const YAHOO_EXCHANGE_SUFFIXES: Record<string, string> = {
  TYO: ".T",
  STO: ".ST",
  SWX: ".SW",
  CPH: ".CO",
  LON: ".L",
  EPA: ".PA",
}

/**
 * Exchanges that list by number. A number-only ticker carries no exchange, so
 * the account's HQ country picks the suffix the market data feed needs.
 */
function suffixForNumericTicker(symbol: string, hqCountry: string): string | null {
  switch (hqCountry.trim().toLowerCase()) {
    case "japan":
      return ".T"
    case "south korea":
      return ".KS"
    case "taiwan":
      return ".TW"
    case "saudi arabia":
      return ".SR"
    case "hong kong":
      return ".HK"
    case "china":
      // Six digits are mainland listings (Shanghai starts with 6); shorter ones trade in Hong Kong.
      if (symbol.length === 6) return symbol.startsWith("6") ? ".SS" : ".SZ"
      return ".HK"
    default:
      return null
  }
}

export function normalizeTickerForYahoo(rawTicker: string, hqCountry?: string | null): string {
  const trimmed = rawTicker.trim()
  if (!trimmed) return ""

  const [exchangePart, symbolPart] = trimmed.includes(":")
    ? trimmed.split(":", 2)
    : ["", trimmed]

  const exchange = exchangePart.trim().toUpperCase()
  const symbol = symbolPart.trim().toUpperCase()
  if (!symbol) return ""

  const suffix = YAHOO_EXCHANGE_SUFFIXES[exchange]
  if (suffix) {
    return `${symbol}${suffix}`
  }

  if (!exchange && hqCountry && /^\d+$/.test(symbol)) {
    const numericSuffix = suffixForNumericTicker(symbol, hqCountry)
    if (numericSuffix) {
      // Hong Kong codes are four digits on the feed ("01070" is 1070.HK, "992" is 0992.HK).
      const code = numericSuffix === ".HK" ? symbol.replace(/^0+/, "").padStart(4, "0") : symbol
      return `${code}${numericSuffix}`
    }
  }

  return symbol
}
