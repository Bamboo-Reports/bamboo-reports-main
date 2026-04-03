#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unified Data Manager (Import, Validate, Schema Snapshot)

Usage:
  python import_data.py                  # Default: Import -> Snapshot -> Validate
  python import_data.py --import         # Import -> Snapshot
  python import_data.py --dry-run        # Validate import flow without DB writes
  python import_data.py --validate       # Just Validate
  python import_data.py --schema         # Just Snapshot
  python import_data.py --check-headers  # Fetch real headers from Google Sheets and diff vs schema
"""

import argparse
import datetime
import json
import logging
import math
import os
import sys
import time
from decimal import Decimal
from numbers import Integral, Real
from typing import Dict, Any, List, Optional

import pandas as pd
import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from gspread_dataframe import get_as_dataframe
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.types import Integer, BigInteger, Text, Float, Boolean, TIMESTAMP

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ------------------------------------------------------------------------------
# CONFIG & CONSTANTS
# ------------------------------------------------------------------------------

CONN_STRING = os.getenv("NEON_DSN") or os.getenv("DATABASE_URL")
if not CONN_STRING:
    raise ValueError("NEON_DSN or DATABASE_URL not set in .env")

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
if not SPREADSHEET_ID:
    raise ValueError("SPREADSHEET_ID not set in .env")

WORKSHEET_MAP = {
    "accounts": "accounts",
    "centers": "centers",
    "services": "services",
    "functions": "functions",
    "tech": "tech",
    "prospects": "prospects",
}

CHUNKSIZE = 1000
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "master-schema.json")
IMPORT_LOG_ROOT = os.path.join(os.path.dirname(__file__), "import_logs")
LOG_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "logs")
SNAPSHOT_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "snapshot")

TYPE_MAPPING = {
    "INTEGER": Integer,
    "BIGINT": BigInteger,
    "TEXT": Text,
    "VARCHAR": Text,
    "TIMESTAMP": TIMESTAMP,
    "BOOLEAN": Boolean,
    "DOUBLE PRECISION": Float,
    "FLOAT": Float,
}

ACCOUNT_UUID_COLUMN = "uuid"
ACCOUNT_KEY_COLUMN = "account_global_legal_name"
IMPORT_SOURCE = "google_sheets_weekly_refresh"
NOTIFICATION_SCHEMA = "audit"
IMPORT_RUNS_TABLE = f"{NOTIFICATION_SCHEMA}.import_runs"
CHANGE_EVENTS_TABLE = f"{NOTIFICATION_SCHEMA}.field_change_events"
NOTIFICATION_READS_TABLE = f"{NOTIFICATION_SCHEMA}.notification_reads"

ALL_IMPORT_TABLES = ["accounts", "centers", "services", "functions", "tech", "prospects"]
TRACKED_EVENT_TABLES = ["accounts", "centers", "services", "tech", "prospects"]
LIFECYCLE_EVENT_TABLES = ["accounts", "centers", "services", "tech", "prospects"]
ROW_ADDED_FIELD = "__row_added__"
ROW_REMOVED_FIELD = "__row_removed__"

TABLE_PRIMARY_ID_COLUMNS = {
    "accounts": ["account_global_legal_name"],
    "centers": ["cn_unique_key"],
    "services": ["cn_unique_key"],
    "tech": ["cn_unique_key"],
    "prospects": ["ps_unique_key"],
}

TABLE_SECONDARY_ID_COLUMNS = {
    "accounts": ["account_global_legal_name"],
    "centers": ["cn_unique_key", "center_name", "account_global_legal_name"],
    "services": ["cn_unique_key", "center_name", "primary_service", "account_global_legal_name"],
    "tech": ["cn_unique_key", "software_in_use", "software_vendor", "software_category", "account_global_legal_name"],
    "prospects": ["prospect_email", "prospect_full_name", "prospect_first_name", "prospect_last_name", "account_global_legal_name"],
}

TABLE_LABEL_COLUMNS = {
    "accounts": ["account_global_legal_name"],
    "centers": ["center_name", "cn_unique_key"],
    "services": ["center_name", "primary_service", "cn_unique_key"],
    "functions": ["function_name", "cn_unique_key"],
    "tech": ["software_in_use", "software_vendor", "cn_unique_key"],
    "prospects": ["prospect_full_name", "prospect_email", "prospect_first_name", "prospect_last_name"],
}

# ------------------------------------------------------------------------------
# LOGGING
# ------------------------------------------------------------------------------

def setup_logger(verbose: bool = False) -> logging.Logger:
    """Configures console (INFO/DEBUG) and file (DEBUG) logging."""
    os.makedirs(LOG_OUTPUT_DIR, exist_ok=True)
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(LOG_OUTPUT_DIR, f"log_{timestamp}.txt")

    logger = logging.getLogger("data_manager")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    # Console
    console = logging.StreamHandler(sys.stdout)
    # If verbose, show DEBUG on console, else INFO
    console.setLevel(logging.DEBUG if verbose else logging.INFO)
    console.setFormatter(fmt)
    logger.addHandler(console)

    # File
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    logger.info("--- SESSION STARTED ---")
    if verbose:
        logger.debug("Verbose mode enabled.")
    logger.debug(f"Log file: {log_file}")
    logger.debug(f"Snapshot dir: {SNAPSHOT_OUTPUT_DIR}")
    return logger

# Initialize with default settings first (non-verbose), re-init in main if needed
logger = setup_logger(verbose=False)

# ------------------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------------------

def load_schema_def() -> Dict[str, Any]:
    if not os.path.exists(SCHEMA_FILE):
        raise FileNotFoundError(f"Schema definition missing: {SCHEMA_FILE}")
    try:
        with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid schema JSON: {e}")
        raise

def check_sheet_headers(schema_def: Dict[str, Any], target_tables: List[str] = None) -> bool:
    """
    Connects to Google Sheets, reads the real first-row headers for each worksheet,
    and performs two checks per table:
      1. Duplicate headers in the sheet itself.
      2. Diff between sheet headers and schema definition:
           - MISSING: column is in schema but absent from the sheet.
           - EXTRA  : column is in the sheet but not defined in the schema.
    Returns True only if every table passes both checks.
    """
    logger.info("Connecting to Google Sheets to validate headers...")

    try:
        gc = get_gspread_client()
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    except Exception as e:
        logger.error(f"  [ERROR] Could not connect to Google Sheets: {e}")
        return False

    tables_to_check = target_tables if target_tables else list(schema_def.keys())
    all_ok = True

    for table in tables_to_check:
        ws_name = WORKSHEET_MAP.get(table)
        if not ws_name:
            logger.warning(f"  [SKIP] No worksheet mapping for table '{table}'.")
            continue
        if table not in schema_def:
            logger.warning(f"  [SKIP] Table '{table}' not found in schema definition.")
            continue

        # --- Fetch real headers from sheet (row 1 only) ---
        try:
            ws = spreadsheet.worksheet(ws_name)
            sheet_headers_raw: List[str] = ws.row_values(1)
            # Strip whitespace, drop empty trailing cells
            sheet_headers = [h.strip() for h in sheet_headers_raw if h.strip()]
        except Exception as e:
            logger.error(f"  [ERROR] Could not read worksheet '{ws_name}': {e}")
            all_ok = False
            continue

        logger.info(f"  Checking '{ws_name}' (sheet) <-> '{table}' (schema)...")

        # --- 1. Duplicate headers in the sheet ---
        seen: Dict[str, int] = {}
        for h in sheet_headers:
            seen[h] = seen.get(h, 0) + 1
        duplicates = {h: cnt for h, cnt in seen.items() if cnt > 1}
        if duplicates:
            all_ok = False
            for dup, cnt in duplicates.items():
                logger.error(f"    [DUPLICATE IN SHEET] '{dup}' appears {cnt} times in sheet '{ws_name}'.")
        else:
            logger.debug(f"    [OK] No duplicate headers in sheet '{ws_name}'.")

        # --- 2. Diff sheet headers vs schema ---
        schema_cols = {c["Column"] for c in schema_def[table].get("columns", [])}
        sheet_cols  = set(sheet_headers)

        missing_from_sheet = schema_cols - sheet_cols   # in schema, not in sheet
        extra_in_sheet     = sheet_cols - schema_cols   # in sheet, not in schema

        if missing_from_sheet:
            all_ok = False
            for col in sorted(missing_from_sheet):
                logger.error(f"    [MISSING IN SHEET] '{col}' is defined in schema but not found in sheet '{ws_name}'.")
        if extra_in_sheet:
            # Extra columns are a warning, not a hard failure - import silently drops them
            for col in sorted(extra_in_sheet):
                logger.warning(f"    [EXTRA IN SHEET]   '{col}' exists in sheet '{ws_name}' but is NOT in schema (will be ignored on import).")

        if not missing_from_sheet and not duplicates:
            logger.info(f"    [OK] Headers match schema. Sheet has {len(sheet_headers)} cols, schema has {len(schema_cols)} cols.")

    if all_ok:
        logger.info("  [SUCCESS] All sheet headers validated successfully.")
    else:
        logger.error("  [FAILED] Header validation found issues - see above.")

    return all_ok

def get_engine() -> Engine:
    return create_engine(CONN_STRING, pool_pre_ping=True)

def get_gspread_client() -> gspread.Client:
    sa_filename = os.getenv("GOOGLE_SA_FILE")
    if not sa_filename:
        raise ValueError("GOOGLE_SA_FILE not set in .env")
    
    key_path = sa_filename if os.path.isabs(sa_filename) else os.path.join(os.path.dirname(__file__), sa_filename)
    if not os.path.exists(key_path):
        raise FileNotFoundError(f"Service account file needed at: {key_path}")
    
    creds = Credentials.from_service_account_file(
        key_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    return gspread.authorize(creds)

def get_tracked_table_fields(schema_def: Dict[str, Any], table: str) -> List[str]:
    """Tracks all columns for a table except uuid (identity field)."""
    if table not in TRACKED_EVENT_TABLES:
        return []

    table_columns = [c["Column"] for c in schema_def.get(table, {}).get("columns", [])]
    identity_cols = set(TABLE_PRIMARY_ID_COLUMNS.get(table, []))
    return [col for col in table_columns if col != ACCOUNT_UUID_COLUMN and col not in identity_cols]

# ------------------------------------------------------------------------------
# DATA PROCESSING
# ------------------------------------------------------------------------------

def clean_dataframe(df: pd.DataFrame, table_schema: Dict) -> pd.DataFrame:
    """Standardizes DataFrame against schema: subset cols, cast types, handle nulls."""
    columns_def = table_schema["columns"]
    schema_cols = [c["Column"] for c in columns_def]
    col_type_map = {c["Column"]: c["Type"] for c in columns_def}

    # Ensure all schema columns exist, dropping any extras
    for col in schema_cols:
        if col not in df.columns:
            logger.warning(f"  [WARN] Missing column '{col}'. Filling with None.")
            df[col] = None
    df = df[schema_cols].copy()

    # Type Casting
    for col_name, col_type in col_type_map.items():
        ctype = col_type.upper()
        series = df[col_name]

        try:
            if ctype in ("INTEGER", "BIGINT"):
                # Remove commas, convert to numeric (result is float if NaN or fractional)
                # Round to nearest integer before casting to Int64 to avoid "safe cast" errors
                # e.g., 123.45 -> 123, 123.99 -> 124
                # Note: 'round()' returns float, 'astype("Int64")' handles float -> int if they are safe (integers as floats).
                # But to force it, we might need to be explicit. 'round()' makes them whole numbers.
                # However, pandas 'Int64' can complain about "non-equivalent" if we have 123.4.
                # So we must round first.
                df[col_name] = (
                    pd.to_numeric(series.astype(str).str.replace(",", ""), errors='coerce')
                    .round() # e.g. 123.6 -> 124.0
                    .astype("Int64") # 124.0 -> 124
                )
            elif ctype in ("DOUBLE PRECISION", "FLOAT"):
                df[col_name] = pd.to_numeric(
                    series.astype(str).str.replace(",", ""), errors='coerce'
                )
            elif ctype == "TIMESTAMP":
                df[col_name] = pd.to_datetime(series, errors='coerce')
            else:
                # Text/Strings: Handle NaNs and empty strings
                df[col_name] = series.astype(str).replace({"nan": None, "None": None}).str.strip()
                # If fully empty string, make it None (for DB null consistency)
                df[col_name] = df[col_name].replace({"": None})
                
        except Exception as e:
            logger.warning(f"  [WARN] Error cleaning '{col_name}': {e}")

    return df

def normalize_change_value(value: Any) -> Optional[str]:
    """Normalizes mixed pandas/SQL values for stable field-level comparisons."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    # Normalize numerics so values like 630.0 and 630 compare as equal.
    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, Integral):
        return str(int(value))

    if isinstance(value, Decimal):
        if value.is_nan():
            return None
        if value == value.to_integral_value():
            return str(int(value))
        normalized = format(value.normalize(), "f")
        return normalized.rstrip("0").rstrip(".")

    if isinstance(value, Real):
        numeric = float(value)
        if not math.isfinite(numeric):
            return None
        if numeric.is_integer():
            return str(int(numeric))
        return format(numeric, ".15g")

    if isinstance(value, (datetime.datetime, datetime.date, pd.Timestamp)):
        return value.isoformat()

    value_str = str(value).strip()
    if value_str.lower() in {"nan", "none", "null", "nat"}:
        return None
    return value_str if value_str else None

def prepare_table_identity_index(df: pd.DataFrame, table: str) -> pd.DataFrame:
    """
    Builds deterministic row identity for any table:
      1) business key columns (table-specific)
      2) secondary composite fallback columns (table-specific)
    """
    if df.empty:
        return df

    primary_cols = [col for col in TABLE_PRIMARY_ID_COLUMNS.get(table, []) if col in df.columns]
    secondary_cols = [col for col in TABLE_SECONDARY_ID_COLUMNS.get(table, []) if col in df.columns]
    configured_primary_cols = TABLE_PRIMARY_ID_COLUMNS.get(table, [])
    if configured_primary_cols and not primary_cols:
        logger.warning(
            f"Primary identity columns {configured_primary_cols} not found for table '{table}'. "
            "Falling back to secondary identity columns."
        )
    if not primary_cols and not secondary_cols:
        return pd.DataFrame()

    norm_df = df.copy()

    def to_identity(row: pd.Series) -> Optional[str]:
        if primary_cols:
            parts = []
            has_any_value = False
            for col in primary_cols:
                normalized = normalize_change_value(row.get(col))
                parts.append(f"{col}={normalized or ''}")
                if normalized is not None:
                    has_any_value = True
            if has_any_value:
                return "key:" + "|".join(parts)

        if not secondary_cols:
            return None

        parts = []
        has_any_value = False
        for col in secondary_cols:
            normalized = normalize_change_value(row.get(col))
            parts.append(f"{col}={normalized or ''}")
            if normalized is not None:
                has_any_value = True
        if has_any_value:
            return "fallback:" + "|".join(parts)
        return None

    norm_df["_identity"] = norm_df.apply(to_identity, axis=1)
    norm_df = norm_df[norm_df["_identity"].notna()]
    if norm_df.empty:
        return norm_df

    duplicate_count = int(norm_df.duplicated(subset=["_identity"]).sum())
    if duplicate_count > 0:
        logger.warning(
            f"Table '{table}' has {duplicate_count} duplicate identity rows. "
            "Only the first row per identity will be used for change comparison."
        )

    return norm_df.drop_duplicates(subset=["_identity"]).set_index("_identity")

def ensure_notification_tables(engine: Engine):
    """Creates notification and import metadata tables if they do not exist."""
    logger.info("Ensuring notification/audit tables...")
    ddl_statements = [
        f"CREATE SCHEMA IF NOT EXISTS {NOTIFICATION_SCHEMA};",
        f"""
        DO $$
        BEGIN
            IF to_regclass('public.import_runs') IS NOT NULL
               AND to_regclass('{IMPORT_RUNS_TABLE}') IS NULL THEN
                ALTER TABLE public.import_runs SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END
        $$;
        """,
        f"""
        DO $$
        BEGIN
            IF to_regclass('public.field_change_events') IS NOT NULL
               AND to_regclass('{CHANGE_EVENTS_TABLE}') IS NULL THEN
                ALTER TABLE public.field_change_events SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END
        $$;
        """,
        f"""
        DO $$
        BEGIN
            IF to_regclass('public.notification_reads') IS NOT NULL
               AND to_regclass('{NOTIFICATION_READS_TABLE}') IS NULL THEN
                ALTER TABLE public.notification_reads SET SCHEMA {NOTIFICATION_SCHEMA};
            END IF;
        END
        $$;
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
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        ADD COLUMN IF NOT EXISTS table_name TEXT;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        ADD COLUMN IF NOT EXISTS record_uuid TEXT;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        ADD COLUMN IF NOT EXISTS record_identity TEXT;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        ADD COLUMN IF NOT EXISTS record_label TEXT;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        ALTER COLUMN table_name SET DEFAULT 'accounts';
        """,
        f"""
        UPDATE {CHANGE_EVENTS_TABLE}
        SET table_name = 'accounts'
        WHERE table_name IS NULL;
        """,
        f"""
        UPDATE {CHANGE_EVENTS_TABLE}
        SET record_label = COALESCE(record_label, record_identity)
        WHERE record_label IS NULL;
        """,
        f"""
        UPDATE {CHANGE_EVENTS_TABLE}
        SET record_identity = COALESCE(record_identity, CONCAT('uuid:', record_uuid))
        WHERE record_identity IS NULL AND record_uuid IS NOT NULL;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        DROP COLUMN IF EXISTS account_uuid;
        """,
        f"""
        ALTER TABLE {CHANGE_EVENTS_TABLE}
        DROP COLUMN IF EXISTS account_global_legal_name;
        """,
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
        CREATE INDEX IF NOT EXISTS field_change_events_changed_at_idx
        ON {CHANGE_EVENTS_TABLE} (changed_at DESC);
        """,
        f"""
        CREATE INDEX IF NOT EXISTS field_change_events_identity_field_idx
        ON {CHANGE_EVENTS_TABLE} (table_name, record_identity, field_name, changed_at DESC);
        """,
        f"""
        CREATE INDEX IF NOT EXISTS field_change_events_table_changed_idx
        ON {CHANGE_EVENTS_TABLE} (table_name, changed_at DESC);
        """,
        f"""
        CREATE INDEX IF NOT EXISTS field_change_events_record_uuid_idx
        ON {CHANGE_EVENTS_TABLE} (record_uuid, changed_at DESC);
        """,
        f"""
        CREATE INDEX IF NOT EXISTS notification_reads_user_read_at_idx
        ON {NOTIFICATION_READS_TABLE} (user_id, read_at DESC);
        """,
    ]

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for ddl in ddl_statements:
            conn.execute(text(ddl))

def create_import_run(engine: Engine, source: str, target_tables: List[str]) -> Optional[int]:
    """Starts an import run entry and returns the run id."""
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            row = conn.execute(
                text(
                    f"""
                    INSERT INTO {IMPORT_RUNS_TABLE} (source, target_tables_json, status)
                    VALUES (:source, :target_tables_json, 'running')
                    RETURNING id
                    """
                ),
                {
                    "source": source,
                    "target_tables_json": json.dumps(target_tables, ensure_ascii=False),
                },
            ).fetchone()
        if row:
            run_id = int(row[0])
            logger.info(f"Started import run id={run_id}")
            return run_id
    except Exception as e:
        logger.warning(f"Could not create import_runs record: {e}")
    return None

def has_completed_import_baseline(engine: Engine) -> bool:
    """Returns True when at least one previously completed import run exists."""
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            result = conn.execute(
                text(
                    f"""
                    SELECT EXISTS (
                        SELECT 1
                        FROM {IMPORT_RUNS_TABLE}
                        WHERE status = 'completed'
                    ) AS has_baseline
                    """
                )
            ).scalar()
        return bool(result)
    except Exception as e:
        logger.warning(f"Could not determine import baseline status: {e}")
        return False

def finalize_import_run(
    engine: Engine,
    run_id: int,
    status: str,
    tables_loaded: int,
    change_events_logged: int,
    error_message: Optional[str] = None,
):
    """Marks an import run as completed."""
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            conn.execute(
                text(
                    f"""
                    UPDATE {IMPORT_RUNS_TABLE}
                    SET status = :status,
                        completed_at = NOW(),
                        tables_loaded = :tables_loaded,
                        change_events_logged = :change_events_logged,
                        error_message = :error_message
                    WHERE id = :run_id
                    """
                ),
                {
                    "status": status,
                    "tables_loaded": tables_loaded,
                    "change_events_logged": change_events_logged,
                    "error_message": error_message,
                    "run_id": run_id,
                },
            )
        logger.info(
            f"Import run id={run_id} finalized with status='{status}', "
            f"tables_loaded={tables_loaded}, change_events={change_events_logged}"
        )
    except Exception as e:
        logger.warning(f"Could not finalize import run id={run_id}: {e}")

def fetch_existing_table_snapshot(engine: Engine, table: str, tracked_fields: List[str]) -> pd.DataFrame:
    """Reads currently persisted table values for tracked fields before table refresh."""
    tracked_fields = tracked_fields or []
    requested_cols = list(
        dict.fromkeys(
            [ACCOUNT_UUID_COLUMN]
            + TABLE_PRIMARY_ID_COLUMNS.get(table, [])
            + TABLE_SECONDARY_ID_COLUMNS.get(table, [])
            + TABLE_LABEL_COLUMNS.get(table, [])
            + [ACCOUNT_KEY_COLUMN]
            + tracked_fields
        )
    )

    inspector = inspect(engine)
    if not inspector.has_table(table):
        logger.info(f"No existing '{table}' table found; skipping pre-import snapshot.")
        return pd.DataFrame(columns=requested_cols)

    select_cols = requested_cols
    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    select_cols = [col for col in select_cols if col in existing_cols]
    if not select_cols:
        return pd.DataFrame(columns=requested_cols)

    select_cols_sql = [f'"{col}"' for col in select_cols]
    sql = f'SELECT {", ".join(select_cols_sql)} FROM "{table}"'

    try:
        with engine.connect() as conn:
            snapshot_df = pd.read_sql(text(sql), conn)
        logger.info(
            f"Captured pre-import '{table}' snapshot: {len(snapshot_df)} rows "
            f"for tracked fields {tracked_fields}"
        )
        return snapshot_df
    except Exception as e:
        logger.warning(f"Could not read existing '{table}' snapshot: {e}")
        return pd.DataFrame(columns=requested_cols)

def get_common_record_count(old_df: pd.DataFrame, new_df: pd.DataFrame, table: str) -> int:
    """Returns the number of overlapping row identities for a table."""
    if old_df.empty or new_df.empty:
        return 0

    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)
    if old_norm.empty or new_norm.empty:
        return 0

    return len(old_norm.index.intersection(new_norm.index))

def resolve_table_row_label(table: str, row_new: pd.Series, row_old: pd.Series) -> Optional[str]:
    """Resolves a human-friendly row label for notifications."""
    for col in TABLE_LABEL_COLUMNS.get(table, []):
        label_new = normalize_change_value(row_new.get(col))
        if label_new:
            return label_new
        label_old = normalize_change_value(row_old.get(col))
        if label_old:
            return label_old

    fallback_name_new = normalize_change_value(row_new.get(ACCOUNT_KEY_COLUMN))
    if fallback_name_new:
        return fallback_name_new
    fallback_name_old = normalize_change_value(row_old.get(ACCOUNT_KEY_COLUMN))
    if fallback_name_old:
        return fallback_name_old
    return None

def compute_table_field_changes(
    old_df: pd.DataFrame, new_df: pd.DataFrame, table: str, tracked_fields: List[str]
) -> List[Dict[str, Optional[str]]]:
    """
    Returns row-level field change events for rows that exist in both snapshots.
    Uses vectorized pandas operations for performance instead of row-by-row loops.
    """
    if old_df.empty or new_df.empty or not tracked_fields:
        return []

    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)
    if old_norm.empty or new_norm.empty:
        return []

    common_rows = old_norm.index.intersection(new_norm.index)
    if len(common_rows) == 0:
        return []

    # Filter to only tracked fields that exist in both dataframes
    available_fields = [f for f in tracked_fields if f in old_norm.columns and f in new_norm.columns]
    if not available_fields:
        return []

    # Align both dataframes to common rows and tracked fields
    old_aligned = old_norm.loc[common_rows, available_fields]
    new_aligned = new_norm.loc[common_rows, available_fields]

    # Vectorized: normalize all values to strings for comparison
    old_str = old_aligned.apply(lambda col: col.map(normalize_change_value))
    new_str = new_aligned.apply(lambda col: col.map(normalize_change_value))

    # Vectorized: find cells that changed (handles None == None correctly)
    changed_mask = (old_str != new_str) & ~(old_str.isna() & new_str.isna())

    # Stack to get (identity, field) pairs for changed cells only
    changed_pairs = changed_mask.stack()
    changed_pairs = changed_pairs[changed_pairs]

    if changed_pairs.empty:
        return []

    # Pre-compute per-row metadata (uuid, label) only for rows that have changes
    changed_identities = changed_pairs.index.get_level_values(0).unique()
    row_metadata: Dict[str, Dict[str, Optional[str]]] = {}
    for identity in changed_identities:
        row_new = new_norm.loc[identity]
        row_old = old_norm.loc[identity]
        row_uuid_new = normalize_change_value(row_new.get(ACCOUNT_UUID_COLUMN))
        row_uuid_old = normalize_change_value(row_old.get(ACCOUNT_UUID_COLUMN))
        row_metadata[identity] = {
            "record_uuid": row_uuid_new or row_uuid_old,
            "record_label": resolve_table_row_label(table, row_new, row_old),
        }

    # Build events from changed pairs
    events: List[Dict[str, Optional[str]]] = []
    for identity, field in changed_pairs.index:
        meta = row_metadata[identity]
        events.append(
            {
                "table_name": table,
                "record_uuid": meta["record_uuid"],
                "record_identity": identity,
                "record_label": meta["record_label"],
                "field_name": field,
                "old_value": old_str.at[identity, field],
                "new_value": new_str.at[identity, field],
            }
        )

    return events

def compute_table_lifecycle_events(
    old_df: pd.DataFrame, new_df: pd.DataFrame, table: str
) -> List[Dict[str, Optional[str]]]:
    """Returns row-level add/remove events by comparing row identities."""
    old_norm = prepare_table_identity_index(old_df, table)
    new_norm = prepare_table_identity_index(new_df, table)

    old_identities = set(old_norm.index)
    new_identities = set(new_norm.index)

    added_identities = sorted(new_identities - old_identities)
    removed_identities = sorted(old_identities - new_identities)

    events: List[Dict[str, Optional[str]]] = []

    for identity in added_identities:
        row_new = new_norm.loc[identity]
        row_uuid = normalize_change_value(row_new.get(ACCOUNT_UUID_COLUMN))
        record_label = resolve_table_row_label(table, row_new, row_new)
        events.append(
            {
                "table_name": table,
                "record_uuid": row_uuid,
                "record_identity": identity,
                "record_label": record_label,
                "field_name": ROW_ADDED_FIELD,
                "old_value": None,
                "new_value": "added",
            }
        )

    for identity in removed_identities:
        row_old = old_norm.loc[identity]
        row_uuid = normalize_change_value(row_old.get(ACCOUNT_UUID_COLUMN))
        record_label = resolve_table_row_label(table, row_old, row_old)
        events.append(
            {
                "table_name": table,
                "record_uuid": row_uuid,
                "record_identity": identity,
                "record_label": record_label,
                "field_name": ROW_REMOVED_FIELD,
                "old_value": "removed",
                "new_value": None,
            }
        )

    return events

RETENTION_DAYS = 90


def cleanup_old_change_events(engine: Engine):
    """Deletes change events older than the retention period to prevent unbounded table growth."""
    try:
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            result = conn.execute(
                text(
                    f"""
                    DELETE FROM {CHANGE_EVENTS_TABLE}
                    WHERE changed_at < NOW() - INTERVAL '{RETENTION_DAYS} days'
                    """
                )
            )
            deleted = result.rowcount
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} change events older than {RETENTION_DAYS} days.")
            else:
                logger.debug(f"No change events older than {RETENTION_DAYS} days to clean up.")
    except Exception as e:
        logger.warning(f"Could not clean up old change events: {e}")


def insert_change_events(
    engine: Engine, import_run_id: int, events: List[Dict[str, Optional[str]]]
) -> int:
    """Persists table field-level changes for notification feeds."""
    if not events:
        return 0

    payload = [
        {
            "import_run_id": import_run_id,
            "table_name": event["table_name"],
            "record_uuid": event["record_uuid"],
            "record_identity": event["record_identity"],
            "record_label": event["record_label"],
            "field_name": event["field_name"],
            "old_value": event["old_value"],
            "new_value": event["new_value"],
        }
        for event in events
        if event.get("record_identity")
    ]

    if not payload:
        return 0

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(
            text(
                f"""
                INSERT INTO {CHANGE_EVENTS_TABLE} (
                    import_run_id,
                    table_name,
                    record_uuid,
                    record_identity,
                    record_label,
                    field_name,
                    old_value,
                    new_value
                ) VALUES (
                    :import_run_id,
                    :table_name,
                    :record_uuid,
                    :record_identity,
                    :record_label,
                    :field_name,
                    :old_value,
                    :new_value
                )
                """
            ),
            payload,
        )

    return len(payload)

# ------------------------------------------------------------------------------
# ACTIONS
# ------------------------------------------------------------------------------

def apply_constraints(engine: Engine):
    """Applies PKs and FKs iteratively."""
    logger.info("Applying Constraints...")
    
    constraints = [
        "ALTER TABLE accounts ADD PRIMARY KEY (account_global_legal_name);",
        "ALTER TABLE centers ADD PRIMARY KEY (cn_unique_key);",
        # FKs
        "ALTER TABLE centers ADD CONSTRAINT fk_cnt_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON DELETE CASCADE;",
        "ALTER TABLE services ADD CONSTRAINT fk_srv_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
        "ALTER TABLE functions ADD CONSTRAINT fk_fnc_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
        "ALTER TABLE tech ADD CONSTRAINT fk_tch_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
        "ALTER TABLE prospects ADD CONSTRAINT fk_prsp_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON DELETE CASCADE;",
    ]

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for sql in constraints:
            conn.execute(text(sql))
            logger.debug(f"  Applied: {sql.split()[0:6]}...")

def apply_indexes(engine: Engine, target_tables: List[str] = None):
    """Applies Indexes and Types extensions."""
    logger.info("Applying Indexes...")

    # 1. Extensions (One-time setup)
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
        logger.debug("  [OK] Extension pg_trgm checked/created.")

    # 2. Define Indexes by Table
    # Note: Keys here must match table names exactly.
    indexes_by_table = {
        "accounts": [
            "create index if not exists accounts_hq_country_idx on public.accounts (account_hq_country);",
            "create index if not exists accounts_hq_industry_idx on public.accounts (account_hq_industry);",
            "create index if not exists accounts_primary_category_idx on public.accounts (account_primary_category);",
            "create index if not exists accounts_primary_nature_idx on public.accounts (account_primary_nature);",
            "create index if not exists accounts_nasscom_status_idx on public.accounts (account_nasscom_status);",
            "create index if not exists accounts_hq_employee_range_idx on public.accounts (account_hq_employee_range);",
            "create index if not exists accounts_center_employees_range_idx on public.accounts (account_center_employees_range);",
            "create index if not exists accounts_hq_revenue_idx on public.accounts (account_hq_revenue);",
            "create index if not exists accounts_years_in_india_idx on public.accounts (years_in_india);",
            "create index if not exists accounts_first_center_year_idx on public.accounts (account_first_center_year);",
            # Trigram
            "create index if not exists accounts_name_trgm_idx on public.accounts using gin (account_global_legal_name gin_trgm_ops);",
        ],
        "centers": [
            "create index if not exists centers_type_idx on public.centers (center_type);",
            "create index if not exists centers_focus_idx on public.centers (center_focus);",
            "create index if not exists centers_city_idx on public.centers (center_city);",
            "create index if not exists centers_state_idx on public.centers (center_state);",
            "create index if not exists centers_country_idx on public.centers (center_country);",
            "create index if not exists centers_employees_range_idx on public.centers (center_employees_range);",
            "create index if not exists centers_status_idx on public.centers (center_status);",
            "create index if not exists centers_inc_year_idx on public.centers (center_inc_year);",
            # Join keys
            "create index if not exists centers_account_name_idx on public.centers (account_global_legal_name);",
        ],
        "tech": [
             # Trigram
            "create index if not exists tech_software_trgm_idx on public.tech using gin (software_in_use gin_trgm_ops);",
            # Join keys
            "create index if not exists tech_center_key_idx on public.tech (cn_unique_key);",
        ],
        "functions": [
            "create index if not exists functions_name_idx on public.functions (function_name);",
            # Join keys
            "create index if not exists functions_center_key_idx on public.functions (cn_unique_key);",
        ],
        "prospects": [
             "create index if not exists prospects_department_idx on public.prospects (prospect_department);",
             "create index if not exists prospects_level_idx on public.prospects (prospect_level);",
             "create index if not exists prospects_city_idx on public.prospects (prospect_city);",
             # Trigram
             "create index if not exists prospects_title_trgm_idx on public.prospects using gin (prospect_title gin_trgm_ops);",
             # Join keys
             "create index if not exists prospects_account_name_idx on public.prospects (account_global_legal_name);",
        ],
        "services": [
             # Join keys
            "create index if not exists services_center_key_idx on public.services (cn_unique_key);",
        ]
    }

    # 3. Execution Loop
    # If target_tables is None, run all. Else filter.
    tables_to_run = target_tables if target_tables else indexes_by_table.keys()

    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")

        for table in tables_to_run:
            if table not in indexes_by_table:
                continue
            
            logger.info(f"  Indexing table: {table}")
            for sql in indexes_by_table[table]:
                conn.execute(text(sql))
                logger.debug(f"    Applied: {sql.strip().split(' on ')[0]}")


def run_import(
    engine: Engine,
    full_schema: Dict,
    target_tables: List[str] = None,
    dry_run: bool = False,
) -> List[str]:
    """Reads Sheets, validates/cleans data, and writes to DB unless dry-run is enabled."""
    try:
        gc = get_gspread_client()
    except Exception as e:
        raise RuntimeError(f"Google Sheets auth failed: {e}") from e

    loaded: List[str] = []
    total_change_events_logged = 0
    import_run_id: Optional[int] = None

    all_known_tables = ALL_IMPORT_TABLES
    if target_tables:
        tables = [t for t in all_known_tables if t in full_schema and t in target_tables]
    else:
        tables = [t for t in all_known_tables if t in full_schema]

    table_tracked_fields: Dict[str, List[str]] = {}
    old_snapshots: Dict[str, pd.DataFrame] = {}
    track_lifecycle_events = True

    if dry_run:
        logger.info("Dry-run mode enabled: no DB write operations will be executed.")
    else:
        ensure_notification_tables(engine)
        track_lifecycle_events = has_completed_import_baseline(engine)
        if not track_lifecycle_events:
            logger.info(
                "Lifecycle add/remove events will be skipped for this run because no "
                "completed baseline import exists yet."
            )
        import_run_id = create_import_run(engine, IMPORT_SOURCE, tables)
        if import_run_id is None:
            raise RuntimeError("Could not create import run record.")

    # Capture old snapshots for all target tables before any drop/recreate starts.
    for table in tables:
        tracked_fields = get_tracked_table_fields(full_schema, table)
        table_tracked_fields[table] = tracked_fields
        if table in TRACKED_EVENT_TABLES:
            logger.info(
                f"Tracking {len(tracked_fields)} fields for table '{table}' "
                f"(excluding identity columns and '{ACCOUNT_UUID_COLUMN}')."
            )
        else:
            logger.info(f"Change tracking skipped for table '{table}'.")
        if not tracked_fields and table not in LIFECYCLE_EVENT_TABLES:
            continue
        old_snapshots[table] = fetch_existing_table_snapshot(engine, table, tracked_fields)

    try:
        for table in tables:
            ws_name = WORKSHEET_MAP.get(table)
            if not ws_name:
                raise RuntimeError(f"No worksheet mapping configured for table '{table}'.")

            logger.info(f"Importing '{ws_name}' -> '{table}'")
            start_time = time.perf_counter()

            ws = gc.open_by_key(SPREADSHEET_ID).worksheet(ws_name)
            df = get_as_dataframe(ws, evaluate_formulas=True, header=0)

            # Basic cleanup of empty rows/cols
            if df is not None:
                df = df.dropna(how="all").loc[:, ~df.columns.astype(str).str.match(r"^Unnamed")]

            if df is None or df.empty:
                raise RuntimeError(f"Worksheet '{ws_name}' is empty.")

            df_clean = clean_dataframe(df, full_schema[table])
            tracked_fields = table_tracked_fields.get(table, [])
            table_field_events: List[Dict[str, Optional[str]]] = []
            table_lifecycle_events: List[Dict[str, Optional[str]]] = []
            table_events: List[Dict[str, Optional[str]]] = []
            common_record_count = 0
            added_count = 0
            removed_count = 0
            old_snapshot = old_snapshots.get(table, pd.DataFrame())

            if tracked_fields:
                common_record_count = get_common_record_count(old_snapshot, df_clean, table)
                table_field_events = compute_table_field_changes(old_snapshot, df_clean, table, tracked_fields)
                table_events.extend(table_field_events)
                logger.debug(
                    f"[CHANGE EVENTS][{table}] overlaps={common_record_count}, "
                    f"computed_events={len(table_field_events)}"
                )

            if table in LIFECYCLE_EVENT_TABLES:
                if track_lifecycle_events:
                    table_lifecycle_events = compute_table_lifecycle_events(old_snapshot, df_clean, table)
                    added_count = sum(1 for event in table_lifecycle_events if event["field_name"] == ROW_ADDED_FIELD)
                    removed_count = sum(1 for event in table_lifecycle_events if event["field_name"] == ROW_REMOVED_FIELD)
                    table_events.extend(table_lifecycle_events)
                    logger.debug(
                        f"[LIFECYCLE EVENTS][{table}] added={added_count}, removed={removed_count}"
                    )
                else:
                    logger.debug(
                        f"[LIFECYCLE EVENTS][{table}] skipped (baseline import not available yet)."
                    )

            # Map types
            dtypes = {
                c["Column"]: TYPE_MAPPING.get(c["Type"].upper(), Text)
                for c in full_schema[table]["columns"]
            }

            if dry_run:
                elapsed = round(time.perf_counter() - start_time, 2)
                logger.info(
                    f"  [DRY-RUN OK] {len(df_clean)} rows validated for table '{table}' in {elapsed}s"
                )
                if tracked_fields:
                    logger.info(
                        f"  [DRY-RUN CHANGE EVENTS] Would log {len(table_field_events)} field changes "
                        f"for tracked fields {tracked_fields}. Compared {common_record_count} common records."
                    )
                if table in LIFECYCLE_EVENT_TABLES:
                    if track_lifecycle_events:
                        logger.info(
                            f"  [DRY-RUN LIFECYCLE EVENTS] Would log {added_count} row additions "
                            f"and {removed_count} row removals for table '{table}'."
                        )
                    else:
                        logger.info(
                            "  [DRY-RUN LIFECYCLE EVENTS] Skipped because no completed baseline "
                            "import exists yet."
                        )
                loaded.append(table)
                continue

            with engine.connect() as conn:
                conn.execution_options(isolation_level="AUTOCOMMIT")
                conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))

            df_clean.to_sql(
                table,
                engine,
                if_exists="replace",
                index=False,
                method="multi",
                chunksize=CHUNKSIZE,
                dtype=dtypes,
            )

            elapsed = round(time.perf_counter() - start_time, 2)
            logger.info(f"  [OK] {len(df_clean)} rows in {elapsed}s")
            loaded.append(table)

            if table_events and import_run_id is not None:
                inserted_count = insert_change_events(engine, import_run_id, table_events)
                total_change_events_logged += inserted_count
                logger.info(
                    f"  [CHANGE EVENTS] Logged {inserted_count} events for table '{table}' "
                    f"({len(table_field_events)} field updates, {added_count} adds, {removed_count} removals)"
                )
            elif tracked_fields or table in LIFECYCLE_EVENT_TABLES:
                logger.info(
                    f"  [CHANGE EVENTS] No changes detected for tracked fields {tracked_fields}. "
                    f"Compared {common_record_count} common records for table '{table}'."
                )
                if common_record_count == 0:
                    logger.warning(
                        f"  [CHANGE EVENTS] No overlapping identities for table '{table}' "
                        "between old DB snapshot and new sheet data."
                    )

        if dry_run:
            logger.info(f"Dry-run completed successfully for tables: {loaded}")
            return loaded

        if loaded:
            apply_constraints(engine)
            apply_indexes(engine, loaded)

        if import_run_id is not None:
            finalize_import_run(
                engine,
                import_run_id,
                status="completed",
                tables_loaded=len(loaded),
                change_events_logged=total_change_events_logged,
                error_message=None,
            )
            cleanup_old_change_events(engine)

        return loaded
    except Exception as e:
        logger.exception(f"Import aborted due to failure: {e}")
        if import_run_id is not None and not dry_run:
            finalize_import_run(
                engine,
                import_run_id,
                status="failed",
                tables_loaded=len(loaded),
                change_events_logged=total_change_events_logged,
                error_message=str(e)[:1000],
            )
        raise

def run_snapshot(engine: Engine, tables: List[str]):
    """Dumps current DB schema stats to JSON."""
    logger.info("Snapshotting Schema...")
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)
    
    inspector = inspect(engine)
    snapshot = {}

    for table in tables:
        if not inspector.has_table(table):
            continue
            
        # Columns
        cols = []
        pk_response = inspector.get_pk_constraint(table)
        pks = set(pk_response.get("constrained_columns", [])) if pk_response else set()
        
        for col in inspector.get_columns(table):
            cols.append({
                "Table": table,
                "Column": col["name"],
                "Type": str(col["type"]),
                "Nullable": "YES" if col["nullable"] else "NO",
                "Default": str(col["default"]) or "",
                "PK": "YES" if col["name"] in pks else "",
            })
            
        # Stats
        try:
            with engine.connect() as conn:
                rows = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0
                size_res = conn.execute(text(f"SELECT pg_total_relation_size('{table}')")).scalar() or 0
                size_mb = round(size_res / (1024**2), 3)
        except Exception:
            rows, size_mb = 0, 0

        snapshot[table] = {
            "columns": cols,
            "statistics": {"Table": table, "Rows": rows, "Size (MB)": size_mb}
        }

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(SNAPSHOT_OUTPUT_DIR, f"schema_{timestamp}.json")
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    logger.info(f"  Snapshot saved: {os.path.basename(path)}")

def run_validate(engine: Engine, schema_def: Dict, target_tables: List[str] = None):
    """Checks if DB matches schema definition."""
    logger.info("Validating Schema...")
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    all_ok = True

    tables_to_check = target_tables if target_tables else schema_def.keys()

    for table, defs in schema_def.items():
        if table not in tables_to_check:
            continue

        if table not in db_tables:
            logger.error(f"  [MISSING] Table '{table}' not found in DB")
            all_ok = False
            continue

        db_cols = {c["name"]: str(c["type"]).upper() for c in inspector.get_columns(table)}
        
        for col_def in defs["columns"]:
            cname = col_def["Column"]
            ctype = col_def["Type"].upper()
            
            if cname not in db_cols:
                logger.error(f"  [MISSING] {table}.{cname}")
                all_ok = False
                continue
            
            # Loose type checking
            db_type = db_cols[cname]
            match = False
            if ctype in db_type: # e.g. INTEGER in INTEGER
                match = True
            elif ctype == "FLOAT" and "DOUBLE" in db_type:
                match = True
            elif ctype == "VARCHAR" and "TEXT" in db_type:
                match = True
            
            if not match:
                logger.warning(f"  [TYPE MISMATCH] {table}.{cname}: Expected {ctype}, got {db_type}")

    if all_ok:
        logger.info("  [SUCCESS] Schema validation passed.")
    else:
        logger.error("  [FAILED] Schema validation found issues.")
        raise RuntimeError("Schema validation failed.")

# ------------------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Utilities for Data Import & Validation")
    parser.add_argument("--import", dest="run_import", action="store_true", help="Run Import from Sheets")
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Run import flow without writing to database tables."
    )
    parser.add_argument("--validate", dest="run_validate", action="store_true", help="Validate Database Schema")
    parser.add_argument("--schema", dest="run_snapshot", action="store_true", help="Take Schema Snapshot")
    parser.add_argument("--index", dest="run_index", action="store_true", help="Apply DB Indexes")
    parser.add_argument(
        "--check-headers", dest="check_headers", action="store_true",
        help="Fetch real headers from Google Sheets and diff them against master-schema.json (no DB connection required)"
    )
    parser.add_argument("--table", "-t", dest="target_table", help="Specific table/sheet to process (e.g., 'centers')")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose (debug) logging")
    args = parser.parse_args()

    # Re-setup logger if verbose is requested
    if args.verbose:
        global logger
        logger = setup_logger(verbose=True)

    mode_selected = args.run_import or args.run_validate or args.run_snapshot or args.run_index or args.check_headers

    # Default behavior:
    # - no args: Import -> Snapshot -> Validate
    # - only --dry-run: import dry-run only
    if not mode_selected and not args.dry_run:
        args.run_import = True
        args.run_validate = True
        args.run_index = True
    elif args.dry_run and not mode_selected:
        args.run_import = True

    full_schema = load_schema_def()

    # Determine target tables (needed early, also used for --check-headers)
    target_tables = None
    if args.target_table:
        if args.target_table not in full_schema:
            logger.error(f"Unknown table '{args.target_table}'. Available: {list(full_schema.keys())}")
            sys.exit(1)
        target_tables = [args.target_table]
        logger.info(f"Targeting single table: {args.target_table}")

    # --check-headers: standalone mode - needs Google Sheets auth but no DB connection
    if args.check_headers:
        logger.info(">>> MODE: CHECK-HEADERS")
        headers_ok = check_sheet_headers(full_schema, target_tables)
        if not headers_ok:
            sys.exit(1)
        # If this is the only flag requested, exit early (no DB needed)
        if not (args.run_import or args.run_validate or args.run_snapshot or args.run_index):
            logger.info("--- DONE ---")
            return

    if args.dry_run and args.run_index and not args.run_import:
        logger.critical("--dry-run cannot be combined with standalone --index.")
        sys.exit(1)

    # All other modes require a DB connection
    try:
        engine = get_engine()
        # Fast connectivity check
        with engine.connect() as _:
            pass
    except Exception as e:
        logger.critical(f"Database connection failed: {e}")
        sys.exit(1)

    # Pre-flight: always validate sheet headers against schema before importing
    if args.run_import:
        preflight_label = "Pre-flight (dry-run)" if args.dry_run else "Pre-flight"
        logger.info(f"{preflight_label}: Validating Google Sheet headers against schema...")
        if not check_sheet_headers(full_schema, target_tables):
            logger.critical("Aborting import - sheet headers do not match schema. Fix the issues above first.")
            engine.dispose()
            sys.exit(1)

    processed_tables = target_tables if target_tables else list(full_schema.keys())

    # 1. Import (Implicitly runs constraints & indexes on loaded tables)
    if args.run_import:
        logger.info(">>> MODE: IMPORT (DRY-RUN)" if args.dry_run else ">>> MODE: IMPORT")
        # For import, we only return what was successfully loaded
        processed_tables = run_import(engine, full_schema, target_tables, dry_run=args.dry_run)

    # 1b. Index Only (Use case: Re-index without import)
    if args.run_index and not args.run_import:
        logger.info(">>> MODE: INDEX")
        # If we didn't import, we index based on target_tables or all known tables
        apply_indexes(engine, target_tables)

    # 2. Snapshot
    # Logic: If we just imported (non-dry-run), snapshot what we processed.
    # If we are just running snapshot mode, and user specified a table, snapshot that.
    # If no table specified, snapshot everything.
    if args.run_snapshot or (args.run_import and not args.dry_run):
        logger.info(">>> MODE: SNAPSHOT")
        run_snapshot(engine, processed_tables)

    # 3. Validate
    if args.run_validate:
        logger.info(">>> MODE: VALIDATE")
        run_validate(engine, full_schema, target_tables)

    engine.dispose()
    logger.info("--- DONE ---")
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n[!] Operation cancelled by user (Ctrl+C). Exiting.")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"\n[!] Unexpected Error: {e}", exc_info=True)
        sys.exit(1)


