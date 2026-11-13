/**
 * Parses a client-provided account list (pasted text, CSV/TSV, or spreadsheet
 * rows) into a clean list of account names. Browser-safe, no dependencies.
 */

export type ParsedAccountTable = {
  headers: string[]
  rows: string[][]
  /** True when the first row looked like a header row. */
  hasHeader: boolean
}

// In a table with several columns, a first-row cell is a header when it is
// made up only of label words ("Account Name", "Company Name (Legal)",
// "Name of the Company", "Vendor Name*"). A cell that merely contains one
// ("Acme Company") is a name, so that row is data. Brackets, their contents
// and punctuation are ignored, and "CompanyName" is read as two words.
const HEADER_WORD_RE = /^(?:accounts?|compan(?:y|ies)|organi[sz]ations?|customers?|clients?|vendors?|suppliers?|names?|legal|global|entity|parent|full|official|registered|business|hq|target|of|the)$/i
const NAME_WORD_RE = /^(?:accounts?|compan(?:y|ies)|organi[sz]ations?|customers?|clients?|names?)$/i

function isNameHeaderCell(cell: string): boolean {
  const words = cell
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
  return words.length > 0 && words.every((word) => HEADER_WORD_RE.test(word)) && words.some((word) => NAME_WORD_RE.test(word))
}

// For a single column, the first cell is only a header when it is clearly a
// label ("Account name", "Company", "Accounts") or a title built from one
// ("Accounts - Sales & Marketing", "Companies: Q4 targets"). A real name that
// merely contains such a word ("Acme Company") stays as data.
const LABEL = "(?:accounts?|compan(?:y|ies)|organi[sz]ations?|customers?|clients?)"
const SINGLE_COLUMN_HEADER_RE = new RegExp(
  `^(?:(?:${LABEL}|legal)\\s+)?(?:names?|${LABEL})$`,
  "i"
)
const SINGLE_COLUMN_TITLE_RE = new RegExp(`^${LABEL}\\s*[-\u2013\u2014:|]\\s*\\S`, "i")

function isSingleColumnHeader(cell: string): boolean {
  const text = cell.trim()
  return SINGLE_COLUMN_HEADER_RE.test(text) || SINGLE_COLUMN_TITLE_RE.test(text)
}

/** Splits one delimited line, honoring double-quoted fields. */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      out.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.map((cell) => cell.trim())
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20)
  const count = (d: string) => sample.reduce((n, l) => n + (l.split(d).length - 1), 0)
  const tabs = count("\t")
  const commas = count(",")
  const semis = count(";")
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t"
  if (semis > commas && semis > 0) return ";"
  return ","
}

/** Parses CSV/TSV/plain text into a table of trimmed cells. */
export function parseDelimitedText(text: string): ParsedAccountTable {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [], hasHeader: false }
  const delimiter = detectDelimiter(lines)
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter))
  return tableFromRows(rows)
}

/**
 * Parses names typed or pasted into the box, one per line. A comma is part of
 * the name there ("Acme Company, Inc."), so lines are only split on tabs, which
 * is what a paste from a spreadsheet carries between columns.
 */
export function parsePastedNames(text: string): ParsedAccountTable {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [], hasHeader: false }
  const tabbed = lines.some((line) => line.includes("\t"))
  // A line copied out of a CSV may still be wrapped in quotes: "Acme, Inc."
  const unquote = (line: string) => {
    const quoted = line.trim().match(/^"(.*)"$/)
    return quoted ? quoted[1].replace(/""/g, '"') : line.trim()
  }
  return tableFromRows(lines.map((line) => (tabbed ? splitDelimitedLine(line, "\t") : [unquote(line)])))
}

/** Builds a table from already-split rows (for example spreadsheet cells), detecting a header row. */
export function tableFromRows(rawRows: string[][]): ParsedAccountTable {
  const rows = rawRows
    .map((row) => row.map((cell) => (cell ?? "").toString().trim()))
    .filter((row) => row.some((cell) => cell.length > 0))
  if (rows.length === 0) return { headers: [], hasHeader: false, rows: [] }
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const padded = rows.map((row) => (row.length < width ? [...row, ...Array(width - row.length).fill("")] : row))
  const first = padded[0]
  const hasHeader = padded.length > 1 && width > 1
    ? first.some(isNameHeaderCell)
    : padded.length > 1 && isSingleColumnHeader(first[0])
  const headers = hasHeader ? first : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  return { headers, rows: hasHeader ? padded.slice(1) : padded, hasHeader }
}

/** Index of the column most likely to hold account names. */
export function guessNameColumn(table: ParsedAccountTable): number {
  if (table.headers.length === 0) return 0
  if (table.hasHeader) {
    const priority = [/account/i, /company/i, /legal/i, /organi[sz]ation/i, /client|customer/i, /name/i]
    for (const re of priority) {
      const idx = table.headers.findIndex((h) => re.test(h))
      if (idx >= 0) return idx
    }
  }
  // Otherwise the column with the most non-numeric text wins.
  let best = 0
  let bestScore = -1
  for (let col = 0; col < table.headers.length; col += 1) {
    let score = 0
    for (const row of table.rows) {
      const cell = row[col] ?? ""
      if (cell && !/^[\d.,%$\s-]+$/.test(cell) && !/^https?:\/\//i.test(cell) && !cell.includes("@")) score += 1
    }
    if (score > bestScore) {
      best = col
      bestScore = score
    }
  }
  return best
}

/** Distinct, trimmed, non-empty names from one column, preserving first-seen order. */
export function extractNames(table: ParsedAccountTable, column: number): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of table.rows) {
    const value = (row[column] ?? "").trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(value)
  }
  return names
}
