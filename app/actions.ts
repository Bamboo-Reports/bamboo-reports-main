/**
 * Central export point for client-invoked server actions only.
 *
 * Keep raw database reads, diagnostics, and legacy mutations out of this
 * barrel so client code cannot accidentally bypass authenticated API routes.
 */
export {
  getUnreadCount,
  getUnreadSummaries,
  getUnreadRecordSummaries,
  markAllAsRead,
  type NotificationSummary,
  type RecordUpdateSummary,
  type NotificationCountResponse,
  type NotificationSummaryListResponse,
  type RecordUpdateSummaryListResponse,
  type RecordUpdateSummaryCursor,
  type NotificationMarkResponse,
} from "@/app/actions/notifications"
