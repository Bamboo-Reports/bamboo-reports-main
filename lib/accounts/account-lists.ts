import type { Filters, FilterValue } from "@/lib/types"

/** A client-provided account list mapped to exact warehouse account names. */
export interface AccountList {
  id: string
  user_id: string
  name: string
  accounts: string[]
  /** Uploaded names that were not mapped to an account. */
  unmatched: string[]
  source_file: string | null
  created_at: string
  updated_at: string
  /** Set on lists shared with the current user (not owned by them). */
  owner_email?: string
}

export const MAX_ACCOUNT_LIST_NAME_LENGTH = 120

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
}

/** Coerces a Supabase row into an AccountList, or null when malformed. */
export function normalizeAccountList(row: Record<string, unknown> | null | undefined): AccountList | null {
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") return null
  return {
    id: row.id,
    user_id: typeof row.user_id === "string" ? row.user_id : "",
    name: row.name,
    accounts: toStringArray(row.accounts),
    unmatched: toStringArray(row.unmatched),
    source_file: typeof row.source_file === "string" ? row.source_file : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  }
}

/** Distinct account names across the given lists, first-seen order. */
export function unionListAccounts(lists: AccountList[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const name of list.accounts) {
      if (seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

/**
 * Derives the exact-name filter (accountNameValues) from the selected account
 * lists (accountListValues). Runs on the client whenever the list selection
 * changes or a saved filter is loaded, so the server only ever sees names.
 *
 * Lists that are no longer available (deleted, or owned by someone else on a
 * shared saved filter) keep whatever names the filter already carried.
 */
export function expandAccountLists(filters: Filters, lists: AccountList[]): Filters {
  const selected = filters.accountListValues ?? []
  if (selected.length === 0) return filters
  const byId = new Map(lists.map((l) => [l.id, l]))
  const include: string[] = []
  const exclude: string[] = []
  let missing = false
  for (const entry of selected) {
    const list = byId.get(entry.value)
    if (!list) {
      missing = true
      continue
    }
    ;(entry.mode === "exclude" ? exclude : include).push(...list.accounts)
  }
  if (missing && include.length === 0 && exclude.length === 0) return filters
  const dedupe = (names: string[], mode: FilterValue["mode"]): FilterValue[] =>
    Array.from(new Set(names)).map((value) => ({ value, mode }))
  return { ...filters, accountNameValues: [...dedupe(include, "include"), ...dedupe(exclude, "exclude")] }
}

/** Sets the selected lists on a filter and re-derives the exact names. */
export function withAccountLists(filters: Filters, selection: FilterValue[], lists: AccountList[]): Filters {
  const next: Filters = { ...filters, accountListValues: selection, accountNameValues: [] }
  return expandAccountLists(next, lists)
}
