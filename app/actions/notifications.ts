"use server"

import { resolveAuthenticatedUserId } from "@/lib/auth/server"
import { getSqlOrThrow, fetchWithRetry } from "@/lib/db/connection"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ROW_REMOVED_FIELD = "__row_removed__"
const UI_VISIBLE_NOTIFICATION_TABLES = ["accounts", "centers", "prospects"]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationSummary {
  table_name: string
  change_type: "added" | "updated"
  record_count: number
  record_labels: string[]
  latest_changed_at: string
}

export interface RecordUpdateSummary {
  record_key: string
  record_uuid: string | null
  record_identity: string | null
  record_label: string | null
  unread_count: number
  latest_changed_at: string
}

export interface NotificationCountResponse {
  success: boolean
  unreadCount: number
  error?: string
}

export interface NotificationSummaryListResponse {
  success: boolean
  data: NotificationSummary[]
  error?: string
}

export interface RecordUpdateSummaryListResponse {
  success: boolean
  data: RecordUpdateSummary[]
  error?: string
}

export interface NotificationMarkResponse {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit as number)))
}

function clampOffset(offset?: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.floor(offset as number))
}

function normalizeTableName(tableName?: string | null): string | null {
  if (!tableName) return null
  const normalized = tableName.trim().toLowerCase()
  return normalized || null
}

/**
 * Resolves the user's last_read_at timestamp from audit.user_notification_state.
 * Returns epoch (1970-01-01) if no row exists (i.e. everything is unread).
 */
async function getUserLastReadAt(
  sqlClient: ReturnType<typeof getSqlOrThrow>,
  userId: string
): Promise<string> {
  const rows = (await fetchWithRetry(
    () => sqlClient`
      SELECT last_read_at
      FROM audit.user_notification_state
      WHERE user_id = ${userId}
    `
  )) as Array<{ last_read_at: string }>

  return rows[0]?.last_read_at ?? "1970-01-01T00:00:00Z"
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Returns the total number of distinct records with unread changes (added + updated).
 */
export async function getUnreadCount(
  accessToken: string
): Promise<NotificationCountResponse> {
  try {
    const userId = await resolveAuthenticatedUserId(accessToken)
    const sqlClient = getSqlOrThrow()
    const lastReadAt = await getUserLastReadAt(sqlClient, userId)

    const result = (await fetchWithRetry(
      () => sqlClient`
        SELECT COUNT(*)::int AS unread_count
        FROM (
          SELECT DISTINCT
            e.table_name,
            COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
          FROM audit.field_change_events e
          WHERE e.field_name <> ${ROW_REMOVED_FIELD}
            AND e.table_name = ANY(${UI_VISIBLE_NOTIFICATION_TABLES})
            AND e.changed_at > ${lastReadAt}
            AND e.changed_at > NOW() - INTERVAL '90 days'
        ) AS unread_records
      `
    )) as Array<{ unread_count: number }>

    return {
      success: true,
      unreadCount: result[0]?.unread_count ?? 0,
    }
  } catch (error) {
    return {
      success: false,
      unreadCount: 0,
      error: error instanceof Error ? error.message : "Failed to get unread notifications count.",
    }
  }
}

/**
 * Returns notification summaries grouped by (table_name, change_type).
 * change_type is "added" for new records or "updated" for modified existing records.
 * record_count is the number of distinct records affected (not individual field changes).
 * At most 6 rows (3 tables x 2 change types).
 */
export async function getUnreadSummaries(params: {
  accessToken: string
}): Promise<NotificationSummaryListResponse> {
  try {
    const userId = await resolveAuthenticatedUserId(params.accessToken)
    const sqlClient = getSqlOrThrow()
    const lastReadAt = await getUserLastReadAt(sqlClient, userId)
    const ROW_ADDED_FIELD = "__row_added__"

    const rows = (await fetchWithRetry(
      () => sqlClient`
        SELECT
          r.table_name,
          r.change_type,
          COUNT(*)::int AS record_count,
          ARRAY_AGG(r.record_label ORDER BY r.latest_changed_at DESC) AS record_labels,
          MAX(r.latest_changed_at) AS latest_changed_at
        FROM (
          SELECT
            e.table_name,
            CASE WHEN e.field_name = ${ROW_ADDED_FIELD} THEN 'added' ELSE 'updated' END AS change_type,
            COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) AS record_key,
            COALESCE(NULLIF(MAX(e.record_label), ''), MAX(e.record_identity), COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)) AS record_label,
            MAX(e.changed_at) AS latest_changed_at
          FROM audit.field_change_events e
          WHERE e.changed_at > ${lastReadAt}
            AND e.changed_at > NOW() - INTERVAL '90 days'
            AND e.field_name <> ${ROW_REMOVED_FIELD}
            AND e.table_name = ANY(${UI_VISIBLE_NOTIFICATION_TABLES})
            AND COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) IS NOT NULL
          GROUP BY e.table_name, change_type, COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
        ) r
        GROUP BY r.table_name, r.change_type
        ORDER BY MAX(r.latest_changed_at) DESC
      `
    )) as Array<{
      table_name: string
      change_type: "added" | "updated"
      record_count: number
      record_labels: string[] | null
      latest_changed_at: string
    }>

    const data: NotificationSummary[] = rows.map((row) => ({
      table_name: row.table_name,
      change_type: row.change_type,
      record_count: row.record_count,
      record_labels: (row.record_labels ?? []).slice(0, 5),
      latest_changed_at: row.latest_changed_at,
    }))

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Failed to fetch notification summaries.",
    }
  }
}

/**
 * Returns per-record update summaries for a specific table, newest first.
 */
export async function getUnreadRecordSummaries(params: {
  accessToken: string
  tableName: string
  limit?: number
  offset?: number
}): Promise<RecordUpdateSummaryListResponse> {
  try {
    const userId = await resolveAuthenticatedUserId(params.accessToken)
    const sqlClient = getSqlOrThrow()
    const normalizedTableName = normalizeTableName(params.tableName)
    if (!normalizedTableName || !UI_VISIBLE_NOTIFICATION_TABLES.includes(normalizedTableName)) {
      return { success: true, data: [] }
    }

    const limit = clampLimit(params.limit)
    const offset = clampOffset(params.offset)
    const lastReadAt = await getUserLastReadAt(sqlClient, userId)

    const data = (await fetchWithRetry(
      () => sqlClient`
        SELECT
          COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) AS record_key,
          MAX(NULLIF(e.record_uuid, '')) AS record_uuid,
          MAX(e.record_identity) AS record_identity,
          MAX(e.record_label) AS record_label,
          COUNT(*)::int AS unread_count,
          MAX(e.changed_at) AS latest_changed_at
        FROM audit.field_change_events e
        WHERE e.changed_at > ${lastReadAt}
          AND e.changed_at > NOW() - INTERVAL '90 days'
          AND e.table_name = ${normalizedTableName}
          AND e.field_name <> ${ROW_REMOVED_FIELD}
          AND COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) IS NOT NULL
        GROUP BY COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
        ORDER BY MAX(e.changed_at) DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    )) as RecordUpdateSummary[]

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Failed to fetch unread record updates.",
    }
  }
}

/**
 * Marks all notifications as read by updating the user's last_read_at to now.
 */
export async function markAllAsRead(
  accessToken: string
): Promise<NotificationMarkResponse> {
  try {
    const userId = await resolveAuthenticatedUserId(accessToken)
    const sqlClient = getSqlOrThrow()

    await fetchWithRetry(
      () => sqlClient`
        INSERT INTO audit.user_notification_state (user_id, last_read_at)
        VALUES (${userId}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_read_at = NOW()
      `
    )

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark all notifications as read.",
    }
  }
}
