import { isServer, QueryClient } from "@tanstack/react-query"

/**
 * Client-side query cache (TanStack Query). The warehouse is refreshed by a
 * weekly import, so cached results never go stale on their own: they stay
 * until unused for a while (gcTime) or until a dashboard refresh clears them.
 * Failures are not retried automatically; the record dialogs show an error
 * with a retry button instead of a skeleton that hangs on backoff (#287).
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 30 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * One client per browser session, and a fresh one per server render so no
 * cache is ever shared between requests (nothing is fetched during SSR today).
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
