"use client"

import { useNotificationContext } from "@/contexts/notification-context"

export function useNotifications() {
  const ctx = useNotificationContext()

  return {
    notificationSummaries: ctx.summaries,
    unreadCount: ctx.unreadCount,
    loadingList: ctx.loadingSummaries,
    loadingCount: ctx.loadingCount,
    error: ctx.error,
    hasSession: ctx.hasSession,
    refreshUnreadCount: ctx.refreshAll,
    loadNotifications: ctx.loadSummaries,
    markAllAsRead: ctx.markAllAsRead,
  }
}
