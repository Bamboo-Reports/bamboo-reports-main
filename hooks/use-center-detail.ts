"use client"

import { useQuery } from "@tanstack/react-query"
import type { CenterDetailResponse } from "@/lib/dashboard/api-client"
import { centerDetailQuery } from "@/lib/dashboard/queries"

interface CenterDetailState {
  data: CenterDetailResponse | null
  loading: boolean
  error: boolean
  retry: () => void
}

/**
 * Loads a centre's services and tech for the centre details dialog. An empty
 * key means the data is not needed. A failed request ends loading and sets
 * `error`, so the dialog can offer a retry instead of skeletons that never
 * resolve (#287). Mirrors useAccountRelated.
 */
export function useCenterDetail(key: string): CenterDetailState {
  const query = useQuery({ ...centerDetailQuery(key), enabled: !!key })
  return {
    data: key ? (query.data ?? null) : null,
    loading: !!key && query.isPending,
    error: !!key && query.isError,
    retry: () => void query.refetch(),
  }
}
