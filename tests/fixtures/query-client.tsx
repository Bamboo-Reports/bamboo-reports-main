import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * A wrapper with its own QueryClient, so no cached response leaks between
 * tests. Pass to render/renderHook as `{ wrapper: createQueryWrapper() }`.
 * Same defaults as lib/query-client (no retries, never stale).
 */
export function createQueryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
