import { queryOptions } from "@tanstack/react-query"
import {
  fetchAccountRelated,
  fetchCenterDetail,
  fetchProspectEngagements,
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
