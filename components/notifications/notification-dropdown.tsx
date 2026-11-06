"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { RiBriefcaseLine, RiBuildingLine, RiCheckDoubleLine, RiFileList2Line, RiGroupLine, RiNotification3Line } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { HintTooltip, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TruncatedText } from "@/components/ui/truncated-text"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNotifications } from "@/hooks/use-notifications"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import {
  formatTableLabel,
  formatRelativeEventDate,
  formatAbsoluteEventDate,
} from "@/lib/notifications/formatters"

const TABLE_ICONS: Record<string, typeof RiBuildingLine> = {
  accounts: RiBuildingLine,
  centers: RiBriefcaseLine,
  prospects: RiGroupLine,
}

/** "17 new centres", "98 centres updated". */
function itemTitle(summary: { table_name: string; change_type: "added" | "updated"; record_count: number }): string {
  const label = formatTableLabel(summary.table_name, summary.record_count).toLowerCase()
  const count = summary.record_count.toLocaleString()
  return summary.change_type === "added" ? `${count} new ${label}` : `${count} ${label} updated`
}

/** Updates from data imports: new and changed records, unread until you mark them read. */
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

  const totalRecords = notificationSummaries.reduce((sum, s) => sum + s.record_count, 0)

  const handleOpenChange = (open: boolean) => {
    if (open) captureEvent(ANALYTICS_EVENTS.NOTIFICATIONS_OPENED, { unread_count: unreadCount })
    setIsOpen(open)
  }

  const handleMarkAllRead = async () => {
    captureEvent(ANALYTICS_EVENTS.NOTIFICATIONS_MARKED_READ, { record_count: totalRecords })
    await markAllAsRead()
  }

  const showList = !isLoading && !error && notificationSummaries.length > 0

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Updates">
              <RiNotification3Line className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              ) : null}
            </Button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent side="bottom" aria-label={unreadCount > 0 ? `${unreadCount} unread` : ""}>
          Updates
          {unreadCount > 0 && <span className="br-tip-hint">{unreadCount} unread</span>}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[380px] overflow-hidden p-0">
        <div className="flex items-center gap-2.5 border-b px-3.5 py-3">
          <p className="text-sm font-medium text-foreground">Updates</p>
          {showList && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {totalRecords.toLocaleString()} record{totalRecords === 1 ? "" : "s"} changed
            </span>
          )}
          <span className="flex-1" />
          {showList ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-primary hover:underline hover:underline-offset-2"
            >
              Mark all as read
            </button>
          ) : null}
        </div>

        <div className="max-h-[420px] overflow-y-auto p-1">
          {!isLoading && error ? (
            <p className="m-2 rounded-lg bg-exclude/[0.06] px-3 py-2.5 text-[13px] text-exclude" role="alert">
              Could not load updates. {error}
            </p>
          ) : null}

          {!isLoading && !error && notificationSummaries.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <RiCheckDoubleLine className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-1.5 text-[13px] font-medium">You&apos;re up to date</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                New and changed accounts, centres and prospects from data updates appear here.
              </p>
            </div>
          ) : null}

          {/* Loading skeleton: mirrors the rows below. */}
          {isLoading ? (
            <div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2.5 px-2.5 py-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {showList
            ? notificationSummaries.map((summary) => {
                const Icon = TABLE_ICONS[summary.table_name.trim().toLowerCase()] ?? RiFileList2Line
                const more = summary.record_count - summary.record_labels.length
                return (
                  <div key={`${summary.table_name}:${summary.change_type}`} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-medium tabular-nums text-foreground">{itemTitle(summary)}</p>
                        <HintTooltip label={formatAbsoluteEventDate(summary.latest_changed_at)}>
                          <p
                            tabIndex={0}
                            className="shrink-0 rounded-sm text-xs tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {formatRelativeEventDate(summary.latest_changed_at)}
                          </p>
                        </HintTooltip>
                      </div>
                      {summary.record_labels.length > 0 ? (
                        <TruncatedText
                          text={`${summary.record_labels.join(", ")}${more > 0 ? ` and ${more.toLocaleString()} more` : ""}`}
                          className="mt-0.5 text-xs text-muted-foreground"
                        />
                      ) : null}
                    </div>
                  </div>
                )
              })
            : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
