// Exchange codes (the ticker sheet's account_hq_stock_exchange column, or a
// prefix such as "TYO:7203") and the suffix the market data feed uses for
// each. US exchanges take no suffix.
const YAHOO_EXCHANGE_SUFFIXES: Record<string, string> = {
  NYSE: "",
  NASDAQ: "",
  // US over-the-counter markets: the feed lists these without a suffix too.
  OTC: "",
  TYO: ".T",
  LON: ".L",
  ETR: ".DE",
  FRA: ".F",
  EPA: ".PA",
  AMS: ".AS",
  EBR: ".BR",
  BIT: ".MI",
  SWX: ".SW",
  STO: ".ST",
  CPH: ".CO",
  HEL: ".HE",
  OSL: ".OL",
  VIE: ".VI",
  BME: ".MC",
  ISE: ".IR",
  ELI: ".LS",
  ATH: ".AT",
  BUD: ".BD",
  WSE: ".WA",
  IST: ".IS",
  MOEX: ".ME",
  TLV: ".TA",
  JSE: ".JO",
  NSE: ".NS",
  BSE: ".BO",
  HKG: ".HK",
  HKEX: ".HK",
  SEHK: ".HK",
  SHA: ".SS",
  SSE: ".SS",
  SHE: ".SZ",
  SZSE: ".SZ",
  KRX: ".KS",
  KOSDAQ: ".KQ",
  TPE: ".TW",
  TWSE: ".TW",
  TPEX: ".TWO",
  SGX: ".SI",
  KLSE: ".KL",
  IDX: ".JK",
  SET: ".BK",
  HOSE: ".VN",
  ASX: ".AX",
  NZX: ".NZ",
  TSX: ".TO",
  TSXV: ".V",
  BMV: ".MX",
  BVMF: ".SA",
  SNSE: ".SN",
  TADAWUL: ".SR",
  DFM: ".AE",
  ADX: ".AD",
  KWSE: ".KW",
  QSE: ".QA",
}

/**
 * A stored ticker as the feed writes it on a known exchange: share classes
 * use a dash ("BRK.B" is BRK-B, "ATCO A" is ATCO-A), and Hong Kong codes are
 * four digits ("01070" is 1070.HK, "992" is 0992.HK).
 */
function withSuffix(symbol: string, suffix: string): string {
  const cleaned = symbol.replace(/[.\s]+/g, "-")
  const code = suffix === ".HK" && /^\d+$/.test(cleaned) ? cleaned.replace(/^0+/, "").padStart(4, "0") : cleaned
  return `${code}${suffix}`
}

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
 * first. Empty when the ticker is blank.
 *
 * The exchange (from the ticker sheet, or a prefix on the ticker) settles it:
 * a ticker alone is ambiguous, since "BA" is Boeing in New York and BAE
 * Systems in London. Without a known exchange the ticker is tried as it is,
 * except that a number-only ticker is placed by the account's HQ country,
 * which can mean two candidates when a country has two boards.
 */
export function yahooTickerCandidates(rawTicker: string, hqCountry?: string | null, exchangeCode?: string | null): string[] {
  const trimmed = rawTicker.trim()
  if (!trimmed) return []

  const [exchangePart, symbolPart] = trimmed.includes(":") ? trimmed.split(":", 2) : ["", trimmed]
  const symbol = symbolPart.trim().toUpperCase()
  if (!symbol) return []

  // The sheet's exchange column wins over a prefix on the ticker.
  for (const code of [exchangeCode, exchangePart]) {
    const suffix = YAHOO_EXCHANGE_SUFFIXES[(code ?? "").trim().toUpperCase()]
    if (suffix !== undefined) return [withSuffix(symbol, suffix)]
  }
  // The sheet names an exchange the feed does not cover (Casablanca, say).
  // Looking the bare ticker up instead would find some other company.
  if (exchangeCode?.trim()) return []

  // No exchange, or one this table does not know: the country can still place a number.
  if (hqCountry && /^\d+$/.test(symbol)) {
    const suffixes = suffixesForNumericTicker(symbol, hqCountry)
    if (suffixes.length > 0) return suffixes.map((numericSuffix) => withSuffix(symbol, numericSuffix))
  }

  return [symbol]
}

/** The most likely feed symbol for a stored ticker ("" when blank). */
export function normalizeTickerForYahoo(rawTicker: string, hqCountry?: string | null, exchangeCode?: string | null): string {
  return yahooTickerCandidates(rawTicker, hqCountry, exchangeCode)[0] ?? ""
}
