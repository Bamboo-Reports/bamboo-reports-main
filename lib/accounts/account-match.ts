/**
 * Account list matching (client-provided account/company lists).
 *
 * Pure helpers shared by the /api/accounts/match route and its tests. The
 * warehouse's account and alias name index is small enough to hold in memory,
 * so every input name is resolved in JS against that index rather than in SQL.
 *
 * Resolution order per input name:
 *   1. exact (case-insensitive) legal name
 *   2. exact (case-insensitive) alias value ("Known as")
 *   3. normalized key (legal suffixes and punctuation stripped)
 *   4. fuzzy token overlap, offered as candidates only, never auto-matched
 */

import type { SqlQuery } from "@/lib/dashboard/filtering-sql"

export const MAX_MATCH_NAMES = 1000
export const MAX_NAME_LENGTH = 200
export const MAX_CANDIDATES = 5

export const ALIAS_FIELDS = ["abbreviated_name", "brand_name", "short_legal_name", "currently_known_as"] as const
export type AliasField = (typeof ALIAS_FIELDS)[number]

export type AccountVisibility = { visibility: "include" | "exclude" | null; note: string | null }

export type AccountIndexRow = {
  name: string
  visibility: string | null
  visibility_note: string | null
}

export type AliasIndexRow = { account_global_legal_name: string } & Partial<Record<AliasField, string | null>>

export type AccountMatchVia = "name" | "alias" | "normalized" | "fuzzy"

export type AccountMatchCandidate = {
  name: string
  via: AccountMatchVia
  /** The alias value that produced the match, when via is "alias". */
  aliasValue?: string
  visibility: AccountVisibility
}

export type AccountMatchStatus = "matched" | "review" | "not_found"

export type AccountMatchResult = {
  input: string
  status: AccountMatchStatus
  /** Set only when status is "matched". */
  match: AccountMatchCandidate | null
  /** Suggestions to pick from when the name could not be matched automatically. */
  candidates: AccountMatchCandidate[]
}

export function buildAccountIndexQuery(): SqlQuery {
  return {
    text: `select account_global_legal_name as name, account_visibility as visibility, account_visibility_note as visibility_note
      from accounts where account_global_legal_name is not null and account_global_legal_name <> ''`,
    values: [],
  }
}

export function buildAliasIndexQuery(): SqlQuery {
  return {
    text: `select account_global_legal_name, ${ALIAS_FIELDS.join(", ")} from alias where account_global_legal_name is not null`,
    values: [],
  }
}

// Legal-form suffixes stripped when building the normalized key. Deliberately
// excludes words like "group" or "holdings" that distinguish real entities.
const LEGAL_SUFFIX =
  "(inc|incorporated|ltd|limited|llc|plc|corp|corporation|co|company|pvt|private|gmbh|sa|ag|nv|bv|llp|lp|pte|pty|srl|sas)"
const SUFFIX_RE = new RegExp(`([\\s,.&]+${LEGAL_SUFFIX}\\.?)+\\s*$`, "i")
const STOP_TOKENS = new Set(["the", "and", "of", "inc", "ltd", "limited", "llc", "corp", "corporation", "co", "company", "pvt", "private", "group", "holdings", "plc", "gmbh"])

/** Lowercased, prefix "the" and trailing legal suffixes removed, alphanumerics only. */
export function normalizeAccountKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*the\s+/, "")
    .replace(SUFFIX_RE, "")
    .replace(/[^a-z0-9]+/g, "")
}

/** Distinct meaningful word tokens used for fuzzy candidate scoring. */
export function tokenizeAccountName(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
  return Array.from(new Set(tokens))
}

function toVisibility(row: AccountIndexRow): AccountVisibility {
  const v = row.visibility === "include" || row.visibility === "exclude" ? row.visibility : null
  return { visibility: v, note: row.visibility_note ?? null }
}

type IndexedAccount = { name: string; key: string; tokens: string[]; visibility: AccountVisibility }

export type AccountMatchIndex = {
  byLowerName: Map<string, IndexedAccount>
  byKey: Map<string, IndexedAccount[]>
  byLowerAlias: Map<string, { account: IndexedAccount; aliasValue: string }[]>
  all: IndexedAccount[]
}

export function buildAccountMatchIndex(accounts: AccountIndexRow[], aliases: AliasIndexRow[]): AccountMatchIndex {
  const byLowerName = new Map<string, IndexedAccount>()
  const byKey = new Map<string, IndexedAccount[]>()
  const all: IndexedAccount[] = []
  for (const row of accounts) {
    const name = String(row.name ?? "").trim()
    if (!name) continue
    const lower = name.toLowerCase()
    if (byLowerName.has(lower)) continue
    const account: IndexedAccount = { name, key: normalizeAccountKey(name), tokens: tokenizeAccountName(name), visibility: toVisibility(row) }
    byLowerName.set(lower, account)
    all.push(account)
    if (account.key) {
      const list = byKey.get(account.key)
      if (list) list.push(account)
      else byKey.set(account.key, [account])
    }
  }

  const byLowerAlias = new Map<string, { account: IndexedAccount; aliasValue: string }[]>()
  for (const row of aliases) {
    const account = byLowerName.get(String(row.account_global_legal_name ?? "").toLowerCase())
    if (!account) continue
    for (const field of ALIAS_FIELDS) {
      const raw = row[field]
      if (typeof raw !== "string") continue
      const aliasValue = raw.trim()
      if (!aliasValue) continue
      const lower = aliasValue.toLowerCase()
      const list = byLowerAlias.get(lower)
      const entry = { account, aliasValue }
      if (list) {
        if (!list.some((e) => e.account.name === account.name)) list.push(entry)
      } else {
        byLowerAlias.set(lower, [entry])
      }
    }
  }

  return { byLowerName, byKey, byLowerAlias, all }
}

function candidate(account: IndexedAccount, via: AccountMatchVia, aliasValue?: string): AccountMatchCandidate {
  return aliasValue ? { name: account.name, via, aliasValue, visibility: account.visibility } : { name: account.name, via, visibility: account.visibility }
}

/** Top fuzzy candidates by token overlap, then by key containment. */
export function fuzzyCandidates(input: string, index: AccountMatchIndex, limit = MAX_CANDIDATES): AccountMatchCandidate[] {
  const key = normalizeAccountKey(input)
  const tokens = tokenizeAccountName(input)
  if (!key && tokens.length === 0) return []
  const scored: { account: IndexedAccount; score: number }[] = []
  for (const account of index.all) {
    let score = 0
    if (key.length >= 4 && account.key.length >= 4) {
      if (account.key === key) score += 10
      else if (account.key.startsWith(key) || key.startsWith(account.key)) score += 6
      else if (account.key.includes(key) || key.includes(account.key)) score += 4
    }
    if (tokens.length > 0) {
      let overlap = 0
      for (const t of tokens) if (account.tokens.includes(t)) overlap += 1
      if (overlap > 0) score += (overlap / Math.max(tokens.length, account.tokens.length)) * 5 + overlap
    }
    if (score > 0) scored.push({ account, score })
  }
  scored.sort((a, b) => b.score - a.score || a.account.name.localeCompare(b.account.name))
  return scored.slice(0, limit).map((s) => candidate(s.account, "fuzzy"))
}

export function matchAccountName(input: string, index: AccountMatchIndex): AccountMatchResult {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()

  const exact = index.byLowerName.get(lower)
  if (exact) return { input: trimmed, status: "matched", match: candidate(exact, "name"), candidates: [] }

  const aliasHits = index.byLowerAlias.get(lower) ?? []
  if (aliasHits.length === 1) {
    return { input: trimmed, status: "matched", match: candidate(aliasHits[0].account, "alias", aliasHits[0].aliasValue), candidates: [] }
  }
  if (aliasHits.length > 1) {
    return { input: trimmed, status: "review", match: null, candidates: aliasHits.map((h) => candidate(h.account, "alias", h.aliasValue)) }
  }

  const key = normalizeAccountKey(trimmed)
  const keyHits = key ? index.byKey.get(key) ?? [] : []
  if (keyHits.length === 1) {
    return { input: trimmed, status: "matched", match: candidate(keyHits[0], "normalized"), candidates: [] }
  }
  if (keyHits.length > 1) {
    return { input: trimmed, status: "review", match: null, candidates: keyHits.map((a) => candidate(a, "normalized")) }
  }

  const fuzzy = fuzzyCandidates(trimmed, index)
  return { input: trimmed, status: fuzzy.length > 0 ? "review" : "not_found", match: null, candidates: fuzzy }
}

export function matchAccountList(inputs: string[], index: AccountMatchIndex): AccountMatchResult[] {
  return inputs.map((input) => matchAccountName(input, index))
}

/** Validates and trims the request body's names; returns an error message when invalid. */
export function parseMatchRequestNames(body: unknown): { names: string[] } | { error: string } {
  const raw = (body as { names?: unknown } | null)?.names
  if (!Array.isArray(raw)) return { error: "Expected a JSON body with a names array" }
  if (raw.length === 0) return { error: "No account names provided" }
  if (raw.length > MAX_MATCH_NAMES) return { error: `Too many names. Upload at most ${MAX_MATCH_NAMES} at a time.` }
  const names: string[] = []
  for (const value of raw) {
    if (typeof value !== "string") return { error: "Every name must be a string" }
    const trimmed = value.trim()
    if (!trimmed) continue
    if (trimmed.length > MAX_NAME_LENGTH) return { error: `Names must be at most ${MAX_NAME_LENGTH} characters` }
    names.push(trimmed)
  }
  if (names.length === 0) return { error: "No account names provided" }
  return { names }
}
