import { queryOptions } from "@tanstack/react-query"
import {
  fetchAccountAutocomplete,
  fetchAccountRelated,
  fetchCenterDetail,
  fetchProspectEngagements,
  fetchSearch,
} from "@/lib/dashboard/api-client"

/**
 * Query definitions for the record lookups, shared by the hooks that render
 * them and by the record opener (queryClient.fetchQuery), so a row click,
 * search hit or "open account" link all reuse one cached response and two
 * dialogs opening the same record at once make one request.
 */

/** Account detail payloads; up to 1MB for accounts with many prospects. */
export const accountRelatedQuery = (name: string) =>
  queryOptions({
    queryKey: ["account-related", name],
    queryFn: () => fetchAccountRelated(name),
  })

export const centerDetailQuery = (key: string) =>
  queryOptions({
    queryKey: ["center-detail", key],
    queryFn: () => fetchCenterDetail(key),
  })

export const prospectEngagementsQuery = (psUniqueKey: string) =>
  queryOptions({
    queryKey: ["prospect-engagements", psUniqueKey],
    queryFn: () => fetchProspectEngagements(psUniqueKey),
  })

// Search lookups. Callers debounce the input and pass only the settled term,
// so the key changes once per pause in typing; revisited terms are instant.

export const searchQuery = (term: string) =>
  queryOptions({
    queryKey: ["search", term],
    queryFn: () => fetchSearch(term),
  })

/** Shared by the account filter autocomplete and the account picker. */
export const accountAutocompleteQuery = (term: string) =>
  queryOptions({
    queryKey: ["account-autocomplete", term],
    queryFn: () => fetchAccountAutocomplete(term),
  })
