"use client"

import { useEffect, type ReactNode } from "react"
import { initAnalytics } from "@/lib/analytics/client"
import { NotificationProvider } from "@/contexts/notification-context"
import { AccountListsProvider } from "@/contexts/account-lists-context"

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAnalytics()
  }, [])

  return (
    <NotificationProvider>
      <AccountListsProvider>{children}</AccountListsProvider>
    </NotificationProvider>
  )
}
