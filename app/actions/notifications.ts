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
  nextCursor?: RecordUpdateSummaryCursor | null
  error?: string
}

export interface NotificationMarkResponse {
  success: boolean
  error?: string
}

export interface RecordUpdateSummaryCursor {
  changedAt: string
  recordKey: string
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

function normalizeCursor(params: {
  cursorChangedAt?: string | null
  cursorRecordKey?: string | null
}): RecordUpdateSummaryCursor | null {
  if (!params.cursorChangedAt || !params.cursorRecordKey) return null
  const changedAt = params.cursorChangedAt.trim()
  const recordKey = params.cursorRecordKey.trim()
  if (!changedAt || !recordKey) return null
  return { changedAt, recordKey }
}

function normalizeTableName(tableName?: string | null): string | null {
  if (!tableName) return null
  const normalized = tableName.trim().toLowerCase()
  return normalized || null
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

    const result = (await fetchWithRetry(
      () => sqlClient`
        WITH notification_state AS (
          SELECT COALESCE(
            (
              SELECT last_read_at
              FROM audit.user_notification_state
              WHERE user_id = ${userId}
            ),
            '1970-01-01T00:00:00Z'::timestamptz
          ) AS last_read_at
        )
        SELECT COUNT(*)::int AS unread_count
        FROM (
          SELECT DISTINCT
            e.table_name,
            COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
          FROM audit.field_change_events e
          CROSS JOIN notification_state s
          WHERE e.field_name <> ${ROW_REMOVED_FIELD}
            AND e.table_name = ANY(${UI_VISIBLE_NOTIFICATION_TABLES})
            AND e.changed_at > s.last_read_at
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
    const ROW_ADDED_FIELD = "__row_added__"

    const rows = (await fetchWithRetry(
      () => sqlClient`
        WITH notification_state AS (
          SELECT COALESCE(
            (
              SELECT last_read_at
              FROM audit.user_notification_state
              WHERE user_id = ${userId}
            ),
            '1970-01-01T00:00:00Z'::timestamptz
          ) AS last_read_at
        ),
        unread_records AS (
          SELECT
            e.table_name,
            CASE WHEN e.field_name = ${ROW_ADDED_FIELD} THEN 'added' ELSE 'updated' END AS change_type,
            COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) AS record_key,
            COALESCE(NULLIF(MAX(e.record_label), ''), MAX(e.record_identity), COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)) AS record_label,
            MAX(e.changed_at) AS latest_changed_at
          FROM audit.field_change_events e
          CROSS JOIN notification_state s
          WHERE e.changed_at > s.last_read_at
            AND e.changed_at > NOW() - INTERVAL '90 days'
            AND e.field_name <> ${ROW_REMOVED_FIELD}
            AND e.table_name = ANY(${UI_VISIBLE_NOTIFICATION_TABLES})
            AND COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) IS NOT NULL
          GROUP BY e.table_name, change_type, COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
        )
        SELECT
          r.table_name,
          r.change_type,
          COUNT(*)::int AS record_count,
          (
            SELECT ARRAY_AGG(label ORDER BY latest_changed_at DESC)
            FROM (
              SELECT r2.record_label AS label, r2.latest_changed_at
              FROM unread_records r2
              WHERE r2.table_name = r.table_name
                AND r2.change_type = r.change_type
                AND r2.record_label IS NOT NULL
              ORDER BY r2.latest_changed_at DESC
              LIMIT 5
            ) limited_labels
          ) AS record_labels,
          MAX(r.latest_changed_at) AS latest_changed_at
        FROM unread_records r
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
      record_labels: row.record_labels ?? [],
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
  cursorChangedAt?: string | null
  cursorRecordKey?: string | null
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
    const cursor = normalizeCursor(params)
    const cursorChangedAt = cursor?.changedAt ?? null
    const cursorRecordKey = cursor?.recordKey ?? null

    const rows = (await fetchWithRetry(
      () => sqlClient`
        WITH notification_state AS (
          SELECT COALESCE(
            (
              SELECT last_read_at
              FROM audit.user_notification_state
              WHERE user_id = ${userId}
            ),
            '1970-01-01T00:00:00Z'::timestamptz
          ) AS last_read_at
        ),
        unread_records AS (
          SELECT
            COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) AS record_key,
            MAX(NULLIF(e.record_uuid, '')) AS record_uuid,
            MAX(e.record_identity) AS record_identity,
            MAX(e.record_label) AS record_label,
            COUNT(*)::int AS unread_count,
            MAX(e.changed_at) AS latest_changed_at
          FROM audit.field_change_events e
          CROSS JOIN notification_state s
          WHERE e.changed_at > s.last_read_at
            AND e.changed_at > NOW() - INTERVAL '90 days'
            AND e.table_name = ${normalizedTableName}
            AND e.field_name <> ${ROW_REMOVED_FIELD}
            AND COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label) IS NOT NULL
          GROUP BY COALESCE(NULLIF(e.record_uuid, ''), e.record_identity, e.record_label)
        )
        SELECT
          record_key,
          record_uuid,
          record_identity,
          record_label,
          unread_count,
          latest_changed_at
        FROM unread_records
        WHERE ${cursorChangedAt}::timestamptz IS NULL
          OR latest_changed_at < ${cursorChangedAt}::timestamptz
          OR (
            latest_changed_at = ${cursorChangedAt}::timestamptz
            AND record_key > ${cursorRecordKey}
          )
        ORDER BY latest_changed_at DESC, record_key ASC
        LIMIT ${limit + 1}
        OFFSET ${offset}
      `
    )) as RecordUpdateSummary[]

    const data = rows.slice(0, limit)
    const last = data[data.length - 1]
    const nextCursor =
      rows.length > limit && last
        ? { changedAt: last.latest_changed_at, recordKey: last.record_key }
        : null

    return { success: true, data, nextCursor }
  } catch (error) {
    return {
      success: false,
      data: [],
      nextCursor: null,
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
