"use client"

import { useEffect, type ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { initAnalytics } from "@/lib/analytics/client"
import { getQueryClient } from "@/lib/query-client"
import { NotificationProvider } from "@/contexts/notification-context"
import { AccountListsProvider } from "@/contexts/account-lists-context"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAnalytics()
  }, [])

  // Not useState: a suspended first render would throw the client away. The
  // browser singleton survives it (TanStack Query advanced SSR guide).
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AccountListsProvider>
          {/* One provider so neighbouring tooltips share the open and skip delays. */}
          <TooltipProvider>{children}</TooltipProvider>
        </AccountListsProvider>
      </NotificationProvider>
    </QueryClientProvider>
  )
}
