"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { capturePageView, initAnalytics } from "@/lib/analytics/client"
import { NotificationProvider } from "@/contexts/notification-context"
import { AccountListsProvider } from "@/contexts/account-lists-context"

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    if (!pathname || typeof window === "undefined") {
      return
    }

    let url = `${window.location.origin}${pathname}`
    if (window.location.search) {
      url += window.location.search
    }

    capturePageView(url)
  }, [pathname])

  return (
    <NotificationProvider>
      <AccountListsProvider>{children}</AccountListsProvider>
    </NotificationProvider>
  )
}
