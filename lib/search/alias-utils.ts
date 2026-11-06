import type { Alias } from "@/lib/types"
import { searchKey } from "@/lib/search/normalize"

export type AliasField =
  | "abbreviated_name"
  | "brand_name"
  | "short_legal_name"
  | "currently_known_as"
  | "flagship_products"

const ALIAS_FIELDS: AliasField[] = [
  "abbreviated_name",
  "brand_name",
  "short_legal_name",
  "currently_known_as",
  "flagship_products",
]

export interface AliasMatch {
  field: AliasField
  value: string
}

export const ALIAS_FIELD_LABELS: Record<AliasField, string> = {
  abbreviated_name: "Abbreviation",
  brand_name: "Brand name",
  short_legal_name: "Short name",
  currently_known_as: "Currently known as",
  flagship_products: "Flagship product",
}

export function buildAliasMap(aliases: Alias[]): Map<string, Alias[]> {
  const map = new Map<string, Alias[]>()
  for (const alias of aliases) {
    if (!alias.account_global_legal_name) continue
    const key = alias.account_global_legal_name.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.push(alias)
    } else {
      map.set(key, [alias])
    }
  }
  return map
}

export function aliasSearchText(aliases: Alias[] | undefined): string {
  if (!aliases || aliases.length === 0) return ""
  const parts: string[] = []
  for (const alias of aliases) {
    for (const field of ALIAS_FIELDS) {
      const value = alias[field]
      if (value) parts.push(value)
    }
  }
  return searchKey(parts.join(" "))
}

export function findAliasMatch(
  aliases: Alias[] | undefined,
  term: string
): AliasMatch | null {
  if (!aliases || aliases.length === 0 || !term) return null
  const lowered = searchKey(term)
  for (const field of ALIAS_FIELDS) {
    for (const alias of aliases) {
      const value = alias[field]
      if (value && searchKey(value).includes(lowered)) {
        return { field, value }
      }
    }
  }
  return null
}
