"use client"

import { useQuery } from "@tanstack/react-query"
import type { AccountRelatedResponse } from "@/lib/dashboard/api-client"
import { accountRelatedQuery } from "@/lib/dashboard/queries"

interface AccountRelatedState {
  data: AccountRelatedResponse | null
  loading: boolean
  error: boolean
  retry: () => void
}

/**
 * Loads an account's related centres, prospects and tech for the record
 * dialogs. An empty name means the data is not needed. A failed request ends
 * loading and sets `error`, so callers can offer a retry instead of a skeleton
 * that never resolves. Responses are cached per account (see
 * accountRelatedQuery); failures are not, so `retry` makes a fresh request.
 */
export function useAccountRelated(name: string): AccountRelatedState {
  const query = useQuery({ ...accountRelatedQuery(name), enabled: !!name })
  return {
    data: name ? (query.data ?? null) : null,
    loading: !!name && query.isPending,
    error: !!name && query.isError,
    retry: () => void query.refetch(),
  }
}
