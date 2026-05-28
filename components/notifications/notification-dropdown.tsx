"use client"

import { useEffect, useState } from "react"
import { Bell, CheckCheck, CirclePlus, Pencil, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNotifications } from "@/hooks/use-notifications"
import {
  formatSummaryTitle,
  formatRelativeEventDate,
  formatAbsoluteEventDate,
  formatTableLabel,
} from "@/lib/notifications/formatters"

export function NotificationDropdown() {
  const {
    notificationSummaries,
    unreadCount,
    loadingList: isLoading,
    error,
    hasSession,
    loadNotifications,
    markAllAsRead,
  } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen || !hasSession) return
    void loadNotifications()
  }, [isOpen, hasSession, loadNotifications])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  const totalRecords = notificationSummaries.reduce((sum, s) => sum + s.record_count, 0)

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          title="Notifications"
          aria-label="Open notifications"
        >
          <Bell className={`h-4 w-4 transition-colors ${unreadCount > 0 ? "text-amber-500" : ""}`} />
          {unreadCount > 0 ? (
            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0 overflow-hidden">
        {/* Header with gradient. matches profile dropdown style */}
        <div className="border-b border-border/60 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-background px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15">
                <Bell className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Activity</p>
                <p className="text-[11px] text-muted-foreground">
                  {isLoading ? "Checking..." : totalRecords > 0 ? `${totalRecords} record${totalRecords === 1 ? "" : "s"} changed` : "All caught up"}
                </p>
              </div>
            </div>
            {totalRecords > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="h-3 w-3" />
                Clear all
              </Button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div className="p-2">
          {/* Error */}
          {!isLoading && error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {/* Empty state */}
          {!isLoading && !error && notificationSummaries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
                <Inbox className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">No new activity</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                  Changes from data imports will appear here.
                </p>
              </div>
            </div>
          ) : null}

          {/* Loading skeleton */}
          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-3">
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-muted/60" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted/60" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Notification items */}
          {!isLoading && !error && notificationSummaries.length > 0 ? (
            <div className="space-y-1.5">
              {notificationSummaries.map((summary) => {
                const isAdded = summary.change_type === "added"
                return (
                  <div
                    key={`${summary.table_name}:${summary.change_type}`}
                    className={`group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      isAdded
                        ? "border-emerald-500/15 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.07]"
                        : "border-sky-500/15 bg-sky-500/[0.03] hover:bg-sky-500/[0.07]"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        isAdded
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                      }`}
                    >
                      {isAdded ? (
                        <CirclePlus className="h-3.5 w-3.5" />
                      ) : (
                        <Pencil className="h-3 w-3" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-medium text-foreground">
                          {formatSummaryTitle(summary)}
                        </p>
                        <p
                          className="shrink-0 text-[10px] text-muted-foreground/70"
                          title={formatAbsoluteEventDate(summary.latest_changed_at)}
                        >
                          {formatRelativeEventDate(summary.latest_changed_at)}
                        </p>
                      </div>
                      {summary.record_labels.length > 0 ? (
                        <p className="mt-0.5 truncate text-[11px] leading-relaxed text-muted-foreground">
                          {summary.record_labels.join(", ")}
                          {summary.record_count > summary.record_labels.length
                            ? ` +${summary.record_count - summary.record_labels.length} more`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
