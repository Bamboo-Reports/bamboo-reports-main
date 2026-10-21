"""Change tracking (the audit schema): import runs, field changes and rows
added or removed between the previous and the new load."""

import json
from typing import Dict, List, Optional

import pandas as pd
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .cleaning import normalize_change_value, prepare_table_identity_index
from .config import (
    ACCOUNT_KEY_COLUMN,
    ACCOUNT_UUID_COLUMN,
    CHANGE_EVENTS_TABLE,
    IMPORT_RUNS_TABLE,
    NOTIFICATION_READS_TABLE,
    NOTIFICATION_SCHEMA,
    RETENTION_DAYS,
    ROW_ADDED_FIELD,
    ROW_REMOVED_FIELD,
    USER_NOTIFICATION_STATE_TABLE,
)
from .logs import logger
from .tables import TABLE_LABEL_COLUMNS, TABLE_PRIMARY_ID_COLUMNS, TABLE_SECONDARY_ID_COLUMNS

# ── Notification / Audit Tables ──────────────────────────────────────────────


def ensure_notification_tables(engine: Engine):
    logger.debug("Ensuring notification/audit tables...")
    ddl_statements = [
        f"CREATE SCHEMA IF NOT EXISTS {NOTIFICATION_SCHEMA};",
        f"""
        DO $$ BEGIN
            IF to_regclass('public.import_runs') IS NOT NULL
               AND to_regclass('{IMPORT_RUNS_TABLE}') IS NULL THEN
                ALTER TABLE public.import_runs SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END $$;
        """,
        f"""
        DO $$ BEGIN
            IF to_regclass('public.field_change_events') IS NOT NULL
               AND to_regclass('{CHANGE_EVENTS_TABLE}') IS NULL THEN
                ALTER TABLE public.field_change_events SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END $$;
        """,
        f"""
        DO $$ BEGIN
            IF to_regclass('public.notification_reads') IS NOT NULL
               AND to_regclass('{NOTIFICATION_READS_TABLE}') IS NULL THEN
                ALTER TABLE public.notification_reads SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END $$;
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {IMPORT_RUNS_TABLE} (
            id BIGSERIAL PRIMARY KEY,
            source TEXT NOT NULL,
            target_tables_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            tables_loaded INTEGER NOT NULL DEFAULT 0,
            change_events_logged INTEGER NOT NULL DEFAULT 0,
            error_message TEXT
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {CHANGE_EVENTS_TABLE} (
            id BIGSERIAL PRIMARY KEY,
            import_run_id BIGINT NOT NULL REFERENCES {IMPORT_RUNS_TABLE}(id) ON DELETE CASCADE,
            table_name TEXT NOT NULL DEFAULT 'accounts',
            record_uuid TEXT,
            record_identity TEXT,
            record_label TEXT,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} ADD COLUMN IF NOT EXISTS table_name TEXT;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} ADD COLUMN IF NOT EXISTS record_uuid TEXT;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} ADD COLUMN IF NOT EXISTS record_identity TEXT;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} ADD COLUMN IF NOT EXISTS record_label TEXT;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} ALTER COLUMN table_name SET DEFAULT 'accounts';",
        f"UPDATE {CHANGE_EVENTS_TABLE} SET table_name = 'accounts' WHERE table_name IS NULL;",
        f"UPDATE {CHANGE_EVENTS_TABLE} SET record_label = COALESCE(record_label, record_identity) WHERE record_label IS NULL;",
        f"UPDATE {CHANGE_EVENTS_TABLE} SET record_identity = COALESCE(record_identity, CONCAT('uuid:', record_uuid)) WHERE record_identity IS NULL AND record_uuid IS NOT NULL;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} DROP COLUMN IF EXISTS account_uuid;",
        f"ALTER TABLE {CHANGE_EVENTS_TABLE} DROP COLUMN IF EXISTS account_global_legal_name;",
        f"""
        CREATE TABLE IF NOT EXISTS {NOTIFICATION_READS_TABLE} (
            id BIGSERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            change_event_id BIGINT NOT NULL REFERENCES {CHANGE_EVENTS_TABLE}(id) ON DELETE CASCADE,
            read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, change_event_id)
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {USER_NOTIFICATION_STATE_TABLE} (
            user_id UUID PRIMARY KEY,
            last_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
        );
        """,
        f"""
        DO $$ BEGIN
            IF to_regclass('{NOTIFICATION_READS_TABLE}') IS NOT NULL THEN
                INSERT INTO {USER_NOTIFICATION_STATE_TABLE} (user_id, last_read_at)
                SELECT user_id, MAX(read_at)
                FROM {NOTIFICATION_READS_TABLE}
                GROUP BY user_id
                ON CONFLICT (user_id)
                DO UPDATE SET last_read_at = GREATEST(
                    {USER_NOTIFICATION_STATE_TABLE}.last_read_at,
                    EXCLUDED.last_read_at
                );
            END IF;
        END $$;
        """,
        f"DROP INDEX IF EXISTS {NOTIFICATION_SCHEMA}.field_change_events_table_changed_idx;",
        f"CREATE INDEX IF NOT EXISTS field_change_events_changed_at_idx ON {CHANGE_EVENTS_TABLE} (changed_at DESC);",
        f"CREATE INDEX IF NOT EXISTS field_change_events_identity_field_idx ON {CHANGE_EVENTS_TABLE} (table_name, record_identity, field_name, changed_at DESC);",
        f"CREATE INDEX IF NOT EXISTS field_change_events_table_changed_at_idx ON {CHANGE_EVENTS_TABLE} (table_name, changed_at DESC);",
        f"""
        CREATE INDEX IF NOT EXISTS field_change_events_unread_record_idx
        ON {CHANGE_EVENTS_TABLE} (
            table_name,
            changed_at DESC,
            (COALESCE(NULLIF(record_uuid, ''), record_identity, record_label))
        )
        WHERE field_name <> '{ROW_REMOVED_FIELD}';
        """,
        f"CREATE INDEX IF NOT EXISTS field_change_events_record_uuid_idx ON {CHANGE_EVENTS_TABLE} (record_uuid, changed_at DESC);",
        f"CREATE INDEX IF NOT EXISTS notification_reads_user_read_at_idx ON {NOTIFICATION_READS_TABLE} (user_id, read_at DESC);",
    ]

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for ddl in ddl_statements:
            conn.execute(text(ddl))


def create_import_run(engine: Engine, source: str, target_tables: List[str]) -> Optional[int]:
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            row = conn.execute(
                text(f"""
                    INSERT INTO {IMPORT_RUNS_TABLE} (source, target_tables_json, status)
                    VALUES (:source, :target_tables_json, 'running')
                    RETURNING id
                """),
                {"source": source, "target_tables_json": json.dumps(target_tables, ensure_ascii=False)},
            ).fetchone()
        if row:
            run_id = int(row[0])
            logger.debug(f"Started import run id={run_id}")
            return run_id
    except Exception as e:
        logger.warning(f"Could not create import_runs record: {e}")
    return None


def has_completed_import_baseline(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            result = conn.execute(
                text(f"SELECT EXISTS (SELECT 1 FROM {IMPORT_RUNS_TABLE} WHERE status = 'completed') AS has_baseline")
            ).scalar()
        return bool(result)
    except Exception as e:
        logger.warning(f"Could not determine import baseline status: {e}")
        return False


def finalize_import_run(
    engine: Engine, run_id: int, status: str, tables_loaded: int,
    change_events_logged: int, error_message: Optional[str] = None,
):
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            conn.execute(
                text(f"""
                    UPDATE {IMPORT_RUNS_TABLE}
                    SET status = :status, completed_at = NOW(), tables_loaded = :tables_loaded,
                        change_events_logged = :change_events_logged, error_message = :error_message
                    WHERE id = :run_id
                """),
                {
                    "status": status, "tables_loaded": tables_loaded,
                    "change_events_logged": change_events_logged,
                    "error_message": error_message, "run_id": run_id,
                },
            )
        logger.debug(f"Import run id={run_id} finalized: status='{status}', tables={tables_loaded}, events={change_events_logged}")
    except Exception as e:
        logger.warning(f"Could not finalize import run id={run_id}: {e}")


# ── Change Detection ─────────────────────────────────────────────────────────


def fetch_existing_table_snapshot(engine: Engine, table: str, tracked_fields: List[str]) -> pd.DataFrame:
    tracked_fields = tracked_fields or []
    requested_cols = list(dict.fromkeys(
        [ACCOUNT_UUID_COLUMN]
        + TABLE_PRIMARY_ID_COLUMNS.get(table, [])
        + TABLE_SECONDARY_ID_COLUMNS.get(table, [])
        + TABLE_LABEL_COLUMNS.get(table, [])
        + [ACCOUNT_KEY_COLUMN]
        + tracked_fields
    ))

    inspector = inspect(engine)
    if not inspector.has_table(table):
        logger.debug(f"No existing '{table}' table; skipping pre-import snapshot.")
        return pd.DataFrame(columns=requested_cols)

    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    select_cols = [col for col in requested_cols if col in existing_cols]
    if not select_cols:
        return pd.DataFrame(columns=requested_cols)

    sql = f'SELECT {", ".join(f"{chr(34)}{c}{chr(34)}" for c in select_cols)} FROM "{table}"'
    try:
        with engine.connect() as conn:
            snapshot_df = pd.read_sql(text(sql), conn)
        logger.debug(f"Pre-import '{table}' snapshot: {len(snapshot_df)} rows")
        return snapshot_df
    except Exception as e:
        logger.warning(f"Could not read '{table}' snapshot: {e}")
        return pd.DataFrame(columns=requested_cols)


def resolve_table_row_label(table: str, row_new: pd.Series, row_old: pd.Series) -> Optional[str]:
    for col in TABLE_LABEL_COLUMNS.get(table, []):
        for row in (row_new, row_old):
            label = normalize_change_value(row.get(col))
            if label:
                return label
    for row in (row_new, row_old):
        fallback = normalize_change_value(row.get(ACCOUNT_KEY_COLUMN))
        if fallback:
            return fallback
    return None


def get_common_record_count(old_df: pd.DataFrame, new_df: pd.DataFrame, table: str) -> int:
    if old_df.empty or new_df.empty:
        return 0
    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)
    if old_norm.empty or new_norm.empty:
        return 0
    return len(old_norm.index.intersection(new_norm.index))


def compute_table_field_changes(
    old_df: pd.DataFrame, new_df: pd.DataFrame, table: str, tracked_fields: List[str],
) -> List[Dict[str, Optional[str]]]:
    if old_df.empty or new_df.empty or not tracked_fields:
        return []

    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)
    if old_norm.empty or new_norm.empty:
        return []

    common_rows = old_norm.index.intersection(new_norm.index)
    if len(common_rows) == 0:
        return []

    available_fields = [f for f in tracked_fields if f in old_norm.columns and f in new_norm.columns]
    if not available_fields:
        return []

    old_aligned = old_norm.loc[common_rows, available_fields]
    new_aligned = new_norm.loc[common_rows, available_fields]

    both_missing = old_aligned.isna() & new_aligned.isna()
    fast_diff = old_aligned.ne(new_aligned).fillna(True) & ~both_missing
    fast_diff = fast_diff.fillna(False).astype(bool)
    fast_changed_pairs = fast_diff.stack()
    fast_changed_pairs = fast_changed_pairs[fast_changed_pairs]

    if fast_changed_pairs.empty:
        return []

    changed_identities = fast_changed_pairs.index.get_level_values(0).unique()
    row_metadata: Dict[str, Dict[str, Optional[str]]] = {}
    for identity in changed_identities:
        row_new = new_norm.loc[identity]
        row_old = old_norm.loc[identity]
        row_metadata[identity] = {
            "record_uuid": normalize_change_value(row_new.get(ACCOUNT_UUID_COLUMN)) or normalize_change_value(row_old.get(ACCOUNT_UUID_COLUMN)),
            "record_label": resolve_table_row_label(table, row_new, row_old),
        }

    events: List[Dict[str, Optional[str]]] = []
    for identity, field in fast_changed_pairs.index:
        old_val = old_aligned.at[identity, field]
        new_val = new_aligned.at[identity, field]

        old_norm_val = normalize_change_value(old_val)
        new_norm_val = normalize_change_value(new_val)

        if old_norm_val != new_norm_val:
            meta = row_metadata[identity]
            events.append({
                "table_name": table,
                "record_uuid": meta["record_uuid"],
                "record_identity": identity,
                "record_label": meta["record_label"],
                "field_name": field,
                "old_value": old_norm_val,
                "new_value": new_norm_val,
            })
    return events


def compute_table_lifecycle_events(
    old_df: pd.DataFrame, new_df: pd.DataFrame, table: str,
) -> List[Dict[str, Optional[str]]]:
    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)

    old_ids = set(old_norm.index)
    new_ids = set(new_norm.index)

    events: List[Dict[str, Optional[str]]] = []

    for identity in sorted(new_ids - old_ids):
        row = new_norm.loc[identity]
        events.append({
            "table_name": table,
            "record_uuid": normalize_change_value(row.get(ACCOUNT_UUID_COLUMN)),
            "record_identity": identity,
            "record_label": resolve_table_row_label(table, row, row),
            "field_name": ROW_ADDED_FIELD,
            "old_value": None,
            "new_value": "added",
        })

    for identity in sorted(old_ids - new_ids):
        row = old_norm.loc[identity]
        events.append({
            "table_name": table,
            "record_uuid": normalize_change_value(row.get(ACCOUNT_UUID_COLUMN)),
            "record_identity": identity,
            "record_label": resolve_table_row_label(table, row, row),
            "field_name": ROW_REMOVED_FIELD,
            "old_value": "removed",
            "new_value": None,
        })
    return events


def cleanup_old_change_events(engine: Engine):
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            result = conn.execute(
                text(f"DELETE FROM {CHANGE_EVENTS_TABLE} WHERE changed_at < NOW() - INTERVAL '{RETENTION_DAYS} days'")
            )
            deleted = result.rowcount
            if deleted > 0:
                logger.debug(f"Cleaned up {deleted} change events older than {RETENTION_DAYS} days.")
    except Exception as e:
        logger.warning(f"Could not clean up old change events: {e}")


def insert_change_events(engine: Engine, import_run_id: int, events: List[Dict[str, Optional[str]]]) -> int:
    if not events:
        return 0

    payload = [
        {
            "import_run_id": import_run_id,
            "table_name": ev["table_name"],
            "record_uuid": ev["record_uuid"],
            "record_identity": ev["record_identity"],
            "record_label": ev["record_label"],
            "field_name": ev["field_name"],
            "old_value": ev["old_value"],
            "new_value": ev["new_value"],
        }
        for ev in events if ev.get("record_identity")
    ]
    if not payload:
        return 0

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(
            text(f"""
                INSERT INTO {CHANGE_EVENTS_TABLE}
                    (import_run_id, table_name, record_uuid, record_identity, record_label, field_name, old_value, new_value)
                VALUES
                    (:import_run_id, :table_name, :record_uuid, :record_identity, :record_label, :field_name, :old_value, :new_value)
            """),
            payload,
        )
    return len(payload)
