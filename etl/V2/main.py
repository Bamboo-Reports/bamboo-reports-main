#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unified Data Manager (Import, Validate, Schema Snapshot)

Usage:
  python etl/main.py                  # Default: Import -> Snapshot -> Validate
  python etl/main.py --import         # Import -> Snapshot
  python etl/main.py --dry-run        # Validate import flow without DB writes
  python etl/main.py --validate       # Just Validate
  python etl/main.py --schema         # Just Snapshot
  python etl/main.py --check-headers  # Diff Google Sheet headers vs schema
"""

import argparse
import datetime
import json
import logging
import math
import os
import re
import concurrent.futures
import sys
import threading
import time
from decimal import Decimal
from numbers import Integral, Real
from typing import Dict, Any, List, Optional

import pandas as pd
import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from gspread_dataframe import get_as_dataframe
from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.theme import Theme
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.types import Integer, BigInteger, Text, Float, Boolean, TIMESTAMP

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BASE_DIR)

for _env_path in (os.path.join(BASE_DIR, ".env"), os.path.join(REPO_ROOT, ".env")):
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        break

# ── Rich Console ─────────────────────────────────────────────────────────────

theme = Theme({
    "info": "cyan",
    "success": "bold green",
    "warning": "bold yellow",
    "error": "bold red",
    "header": "bold magenta",
    "table_name": "bold cyan",
    "dim": "dim white",
})
console = Console(theme=theme)

# ── Config ───────────────────────────────────────────────────────────────────

CONN_STRING = os.getenv("NEON_DSN") or os.getenv("DATABASE_URL")
if not CONN_STRING:
    console.print("[error]NEON_DSN or DATABASE_URL not set in .env[/]")
    sys.exit(1)

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
if not SPREADSHEET_ID:
    console.print("[error]SPREADSHEET_ID not set in .env[/]")
    sys.exit(1)

CHUNKSIZE = 1000
RETENTION_DAYS = 90
SCHEMA_FILE = os.path.join(BASE_DIR, "master-schema.json")
IMPORT_LOG_ROOT = os.path.join(BASE_DIR, "import_logs")
LOG_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "logs")
SNAPSHOT_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "snapshot")

ACCOUNT_UUID_COLUMN = "uuid"
ACCOUNT_KEY_COLUMN = "account_global_legal_name"
IMPORT_SOURCE = "google_sheets_weekly_refresh"

NOTIFICATION_SCHEMA = "audit"
IMPORT_RUNS_TABLE = f"{NOTIFICATION_SCHEMA}.import_runs"
CHANGE_EVENTS_TABLE = f"{NOTIFICATION_SCHEMA}.field_change_events"
NOTIFICATION_READS_TABLE = f"{NOTIFICATION_SCHEMA}.notification_reads"
USER_NOTIFICATION_STATE_TABLE = f"{NOTIFICATION_SCHEMA}.user_notification_state"

ROW_ADDED_FIELD = "__row_added__"
ROW_REMOVED_FIELD = "__row_removed__"

# ── Table Definitions (single source of truth) ──────────────────────────────

TABLE_DEFS: Dict[str, Dict[str, Any]] = {
    "accounts": {
        "worksheet": "accounts",
        "primary_id": ["account_global_legal_name"],
        "secondary_id": ["account_global_legal_name"],
        "label_cols": ["account_global_legal_name"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS accounts_hq_country_idx ON public.accounts (account_hq_country);",
            "CREATE INDEX IF NOT EXISTS accounts_hq_industry_idx ON public.accounts (account_hq_industry);",
            "CREATE INDEX IF NOT EXISTS accounts_primary_category_idx ON public.accounts (account_primary_category);",
            "CREATE INDEX IF NOT EXISTS accounts_primary_nature_idx ON public.accounts (account_primary_nature);",
            "CREATE INDEX IF NOT EXISTS accounts_nasscom_status_idx ON public.accounts (account_nasscom_status);",
            "CREATE INDEX IF NOT EXISTS accounts_hq_employee_range_idx ON public.accounts (account_hq_employee_range);",
            "CREATE INDEX IF NOT EXISTS accounts_center_employees_range_idx ON public.accounts (account_center_employees_range);",
            "CREATE INDEX IF NOT EXISTS accounts_hq_revenue_idx ON public.accounts (account_hq_revenue);",
            "CREATE INDEX IF NOT EXISTS accounts_years_in_india_idx ON public.accounts (years_in_india);",
            "CREATE INDEX IF NOT EXISTS accounts_first_center_year_idx ON public.accounts (account_first_center_year);",
            "CREATE INDEX IF NOT EXISTS accounts_visibility_idx ON public.accounts (account_visibility);",
            "CREATE INDEX IF NOT EXISTS accounts_name_trgm_idx ON public.accounts USING gin (account_global_legal_name gin_trgm_ops);",
        ],
    },
    "alias": {
        "worksheet": "alias",
        "primary_id": ["account_global_legal_name"],
        "secondary_id": ["account_global_legal_name"],
        "label_cols": ["account_global_legal_name"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS alias_account_name_idx ON public.alias (account_global_legal_name);",
            "CREATE INDEX IF NOT EXISTS alias_brand_name_idx ON public.alias (brand_name);",
        ],
    },
    "centers": {
        "worksheet": "centers",
        "primary_id": ["cn_unique_key"],
        "secondary_id": ["cn_unique_key", "center_name", "account_global_legal_name"],
        "label_cols": ["center_name", "cn_unique_key"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS centers_type_idx ON public.centers (center_type);",
            "CREATE INDEX IF NOT EXISTS centers_focus_idx ON public.centers (center_focus);",
            "CREATE INDEX IF NOT EXISTS centers_city_idx ON public.centers (center_city);",
            "CREATE INDEX IF NOT EXISTS centers_state_idx ON public.centers (center_state);",
            "CREATE INDEX IF NOT EXISTS centers_country_idx ON public.centers (center_country);",
            "CREATE INDEX IF NOT EXISTS centers_employees_range_idx ON public.centers (center_employees_range);",
            "CREATE INDEX IF NOT EXISTS centers_status_idx ON public.centers (center_status);",
            "CREATE INDEX IF NOT EXISTS centers_inc_year_idx ON public.centers (center_inc_year);",
            "CREATE INDEX IF NOT EXISTS centers_account_name_idx ON public.centers (account_global_legal_name);",
        ],
    },
    "services": {
        "worksheet": "services",
        "primary_id": ["cn_unique_key"],
        "secondary_id": ["cn_unique_key", "center_name", "primary_service", "account_global_legal_name"],
        "label_cols": ["center_name", "primary_service", "cn_unique_key"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS services_center_key_idx ON public.services (cn_unique_key);",
        ],
    },
    "functions": {
        "worksheet": "functions",
        "primary_id": [],
        "secondary_id": [],
        "label_cols": ["function_name", "cn_unique_key"],
        "track_changes": False,
        "track_lifecycle": False,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS functions_name_idx ON public.functions (function_name);",
            "CREATE INDEX IF NOT EXISTS functions_center_key_idx ON public.functions (cn_unique_key);",
        ],
    },
    "tech": {
        "worksheet": "tech",
        "primary_id": ["cn_unique_key"],
        "secondary_id": ["cn_unique_key", "software_in_use", "software_vendor", "software_category", "account_global_legal_name"],
        "label_cols": ["software_in_use", "software_vendor", "cn_unique_key"],
        "track_changes": False,
        "track_lifecycle": False,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS tech_software_trgm_idx ON public.tech USING gin (software_in_use gin_trgm_ops);",
            "CREATE INDEX IF NOT EXISTS tech_center_key_idx ON public.tech (cn_unique_key);",
        ],
    },
    "prospects": {
        "worksheet": "prospects",
        "primary_id": ["ps_unique_key"],
        "secondary_id": ["prospect_email", "prospect_full_name", "prospect_first_name", "prospect_last_name", "account_global_legal_name"],
        "label_cols": ["prospect_full_name", "prospect_email", "prospect_first_name", "prospect_last_name"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS prospects_unique_key_idx ON public.prospects (ps_unique_key);",
            "CREATE INDEX IF NOT EXISTS prospects_department_idx ON public.prospects (prospect_department);",
            "CREATE INDEX IF NOT EXISTS prospects_level_idx ON public.prospects (prospect_level);",
            "CREATE INDEX IF NOT EXISTS prospects_head_type_idx ON public.prospects (head_type);",
            "CREATE INDEX IF NOT EXISTS prospects_center_name_idx ON public.prospects (center_name);",
            "CREATE INDEX IF NOT EXISTS prospects_city_idx ON public.prospects (prospect_city);",
            "CREATE INDEX IF NOT EXISTS prospects_title_trgm_idx ON public.prospects USING gin (prospect_title gin_trgm_ops);",
            "CREATE INDEX IF NOT EXISTS prospects_account_name_idx ON public.prospects (account_global_legal_name);",
        ],
    },
}

IMPORT_ORDER = ["accounts", "alias", "centers", "services", "functions", "tech", "prospects"]

CONSTRAINTS_SQL = [
    "ALTER TABLE accounts ADD PRIMARY KEY (account_global_legal_name);",
    "ALTER TABLE alias ADD CONSTRAINT fk_alias_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON UPDATE CASCADE ON DELETE CASCADE;",
    "ALTER TABLE centers ADD PRIMARY KEY (cn_unique_key);",
    "ALTER TABLE centers ADD CONSTRAINT fk_cnt_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON DELETE CASCADE;",
    "ALTER TABLE services ADD CONSTRAINT fk_srv_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
    "ALTER TABLE functions ADD CONSTRAINT fk_fnc_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
    "ALTER TABLE tech ADD CONSTRAINT fk_tch_cnt FOREIGN KEY (cn_unique_key) REFERENCES centers (cn_unique_key) ON DELETE CASCADE;",
    "ALTER TABLE prospects ADD CONSTRAINT fk_prsp_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON DELETE CASCADE;",
]

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

# ── Derived lookups from TABLE_DEFS ──────────────────────────────────────────


def _lookup(key: str) -> Dict[str, Any]:
    return {name: defn[key] for name, defn in TABLE_DEFS.items() if defn.get(key)}


WORKSHEET_MAP = {name: defn["worksheet"] for name, defn in TABLE_DEFS.items()}
TABLE_PRIMARY_ID_COLUMNS = {name: defn["primary_id"] for name, defn in TABLE_DEFS.items() if defn["primary_id"]}
TABLE_SECONDARY_ID_COLUMNS = {name: defn["secondary_id"] for name, defn in TABLE_DEFS.items() if defn["secondary_id"]}
TABLE_LABEL_COLUMNS = {name: defn["label_cols"] for name, defn in TABLE_DEFS.items()}
TRACKED_EVENT_TABLES = [name for name, defn in TABLE_DEFS.items() if defn["track_changes"]]
LIFECYCLE_EVENT_TABLES = [name for name, defn in TABLE_DEFS.items() if defn["track_lifecycle"]]

# ── Logging ──────────────────────────────────────────────────────────────────


def setup_logger(verbose: bool = False) -> logging.Logger:
    os.makedirs(LOG_OUTPUT_DIR, exist_ok=True)
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(LOG_OUTPUT_DIR, f"log_{timestamp}.txt")

    logger = logging.getLogger("data_manager")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    # Rich console handler
    rich_handler = RichHandler(
        console=console,
        show_time=False,
        show_path=False,
        markup=True,
        rich_tracebacks=True,
        level=logging.DEBUG if verbose else logging.INFO,
    )
    logger.addHandler(rich_handler)

    # File handler
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    logger.debug(f"Log file: {log_file}")
    return logger


logger = setup_logger(verbose=False)

# ── Helpers ──────────────────────────────────────────────────────────────────


def load_schema_def() -> Dict[str, Any]:
    if not os.path.exists(SCHEMA_FILE):
        raise FileNotFoundError(f"Schema definition missing: {SCHEMA_FILE}")
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_engine() -> Engine:
    return create_engine(CONN_STRING, pool_pre_ping=True)


def get_gspread_client() -> gspread.Client:
    sa_filename = os.getenv("GOOGLE_SA_FILE")
    if not sa_filename:
        raise ValueError("GOOGLE_SA_FILE not set in .env")
    if os.path.isabs(sa_filename):
        key_path = sa_filename
    else:
        key_path = next(
            (p for p in (os.path.join(BASE_DIR, sa_filename), os.path.join(REPO_ROOT, sa_filename)) if os.path.exists(p)),
            os.path.join(REPO_ROOT, sa_filename),
        )
    if not os.path.exists(key_path):
        raise FileNotFoundError(f"Service account file needed at: {key_path}")
    creds = Credentials.from_service_account_file(
        key_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    return gspread.authorize(creds)


def get_tracked_table_fields(schema_def: Dict[str, Any], table: str) -> List[str]:
    if table not in TRACKED_EVENT_TABLES:
        return []
    table_columns = [c["Column"] for c in schema_def.get(table, {}).get("columns", [])]
    identity_cols = set(TABLE_PRIMARY_ID_COLUMNS.get(table, []))
    return [col for col in table_columns if col != ACCOUNT_UUID_COLUMN and col not in identity_cols]


# ── Header Checking ──────────────────────────────────────────────────────────


def check_sheet_headers(schema_def: Dict[str, Any], target_tables: List[str] = None) -> bool:
    console.print(Panel("[header]Validating Google Sheet Headers[/]", expand=False))

    try:
        gc = get_gspread_client()
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    except Exception as e:
        logger.error(f"Could not connect to Google Sheets: {e}")
        return False

    tables_to_check = target_tables or list(schema_def.keys())
    all_ok = True

    def check_table(table_name):
        ws_name = WORKSHEET_MAP.get(table_name)
        if not ws_name:
            logger.warning(f"No worksheet mapping for table '{table_name}'.")
            return None, True
        if table_name not in schema_def:
            logger.warning(f"Table '{table_name}' not found in schema definition.")
            return None, True

        try:
            ws = spreadsheet.worksheet(ws_name)
            sheet_headers = [h.strip() for h in ws.row_values(1) if h.strip()]
        except Exception as e:
            logger.error(f"Could not read worksheet '{ws_name}': {e}")
            return None, False

        schema_cols = {c["Column"] for c in schema_def[table_name].get("columns", [])}
        sheet_cols = set(sheet_headers)

        # Check duplicates
        seen: Dict[str, int] = {}
        for h in sheet_headers:
            seen[h] = seen.get(h, 0) + 1
        duplicates = {h: cnt for h, cnt in seen.items() if cnt > 1}

        missing = sorted(schema_cols - sheet_cols)
        extra = sorted(sheet_cols - schema_cols)

        # Build results table
        result_table = Table(title=f"[table_name]{ws_name}[/] -> [table_name]{table_name}[/]", show_lines=True)
        result_table.add_column("Check", style="bold")
        result_table.add_column("Status", justify="center")
        result_table.add_column("Details")

        table_ok = True
        if duplicates:
            table_ok = False
            dup_str = ", ".join(f"'{h}' x{cnt}" for h, cnt in duplicates.items())
            result_table.add_row("Duplicates", "[error]FAIL[/]", dup_str)
        else:
            result_table.add_row("Duplicates", "[success]OK[/]", "None")

        if missing:
            table_ok = False
            result_table.add_row("Missing in Sheet", "[error]FAIL[/]", ", ".join(missing))
        else:
            result_table.add_row("Missing in Sheet", "[success]OK[/]", "None")

        if extra:
            result_table.add_row("Extra in Sheet", "[warning]WARN[/]", ", ".join(extra))
        else:
            result_table.add_row("Extra in Sheet", "[success]OK[/]", "None")

        result_table.add_row(
            "Column Count",
            "[info]INFO[/]",
            f"Sheet: {len(sheet_headers)} | Schema: {len(schema_cols)}",
        )
        return result_table, table_ok

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables_to_check)))) as executor:
        future_to_table = {executor.submit(check_table, t): t for t in tables_to_check}
        for future in concurrent.futures.as_completed(future_to_table):
            result_table, table_ok = future.result()
            if not table_ok:
                all_ok = False
            if result_table:
                console.print(result_table)

    if all_ok:
        console.print("[success]All sheet headers validated successfully.[/]")
    else:
        console.print("[error]Header validation found issues - see above.[/]")
    return all_ok


# ── Data Processing ──────────────────────────────────────────────────────────


def clean_dataframe(df: pd.DataFrame, table_schema: Dict) -> pd.DataFrame:
    columns_def = table_schema["columns"]
    schema_cols = [c["Column"] for c in columns_def]
    col_type_map = {c["Column"]: c["Type"] for c in columns_def}

    for col in schema_cols:
        if col not in df.columns:
            logger.warning(f"Missing column '{col}'. Filling with None.")
            df[col] = None
    df = df[schema_cols].copy()

    for col_name, col_type in col_type_map.items():
        ctype = col_type.upper()
        series = df[col_name]
        try:
            if ctype in ("INTEGER", "BIGINT"):
                df[col_name] = (
                    pd.to_numeric(series.astype(str).str.replace(",", ""), errors="coerce")
                    .round()
                    .astype("Int64")
                )
            elif ctype in ("DOUBLE PRECISION", "FLOAT"):
                df[col_name] = pd.to_numeric(
                    series.astype(str).str.replace(",", ""), errors="coerce"
                )
            elif ctype == "TIMESTAMP":
                df[col_name] = pd.to_datetime(series, errors="coerce")
            else:
                df[col_name] = series.map(lambda value: normalize_text_value(value, col_name))
        except Exception as e:
            logger.warning(f"Error cleaning '{col_name}': {e}")

    return df


def normalize_change_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

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


INTEGER_FLOAT_TEXT_RE = re.compile(r"^([+-]?\d+)\.0+$")
INTEGER_FLOAT_TEXT_COLUMNS = ("zip", "postal", "postcode", "year")


def normalize_text_value(value: Any, col_name: str) -> Optional[str]:
    if any(marker in col_name.lower() for marker in INTEGER_FLOAT_TEXT_COLUMNS):
        normalized = normalize_change_value(value)
        if normalized is None:
            return None
        match = INTEGER_FLOAT_TEXT_RE.fullmatch(normalized.replace(",", ""))
        if match:
            return match.group(1)
        return normalized

    value_str = str(value).strip()
    if value_str.lower() in {"nan", "none", "null", "nat", ""}:
        return None
    return value_str


def prepare_table_identity_index(df: pd.DataFrame, table: str) -> pd.DataFrame:
    if df.empty:
        return df

    primary_cols = [col for col in TABLE_PRIMARY_ID_COLUMNS.get(table, []) if col in df.columns]
    secondary_cols = [col for col in TABLE_SECONDARY_ID_COLUMNS.get(table, []) if col in df.columns]

    if not primary_cols and not secondary_cols:
        return pd.DataFrame()

    norm_df = df.copy()

    def build_identity_series(cols: List[str], prefix: str):
        series = None
        has_val = pd.Series(False, index=df.index)
        for col in cols:
            norm_col = df[col].map(normalize_change_value)
            has_val = has_val | norm_col.notna()
            part = col + "=" + norm_col.fillna("")
            if series is None:
                series = part
            else:
                series = series + "|" + part
        return pd.Series(prefix, index=df.index) + series, has_val

    primary_series, primary_has_val = None, None
    if primary_cols:
        primary_series, primary_has_val = build_identity_series(primary_cols, "key:")

    secondary_series, secondary_has_val = None, None
    if secondary_cols:
        secondary_series, secondary_has_val = build_identity_series(secondary_cols, "fallback:")

    if primary_cols and secondary_cols:
        res = primary_series.where(primary_has_val, secondary_series)
        res = res.where(primary_has_val | secondary_has_val, None)
    elif primary_cols:
        res = primary_series.where(primary_has_val, None)
    else:
        res = secondary_series.where(secondary_has_val, None)

    norm_df["_identity"] = res
    norm_df = norm_df[norm_df["_identity"].notna()]
    if norm_df.empty:
        return norm_df

    dup_count = int(norm_df.duplicated(subset=["_identity"]).sum())
    if dup_count > 0:
        logger.warning(f"Table '{table}' has {dup_count} duplicate identity rows. First per identity used.")

    return norm_df.drop_duplicates(subset=["_identity"]).set_index("_identity")


# ── Notification / Audit Tables ──────────────────────────────────────────────


def ensure_notification_tables(engine: Engine):
    logger.info("Ensuring notification/audit tables...")
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
            logger.info(f"Started import run id={run_id}")
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
        logger.info(f"Import run id={run_id} finalized: status='{status}', tables={tables_loaded}, events={change_events_logged}")
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
        logger.info(f"No existing '{table}' table; skipping pre-import snapshot.")
        return pd.DataFrame(columns=requested_cols)

    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    select_cols = [col for col in requested_cols if col in existing_cols]
    if not select_cols:
        return pd.DataFrame(columns=requested_cols)

    sql = f'SELECT {", ".join(f"{chr(34)}{c}{chr(34)}" for c in select_cols)} FROM "{table}"'
    try:
        with engine.connect() as conn:
            snapshot_df = pd.read_sql(text(sql), conn)
        logger.info(f"Pre-import '{table}' snapshot: {len(snapshot_df)} rows")
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

    fast_diff = (old_aligned != new_aligned) & ~(old_aligned.isna() & new_aligned.isna())
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
                logger.info(f"Cleaned up {deleted} change events older than {RETENTION_DAYS} days.")
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


# ── Actions ──────────────────────────────────────────────────────────────────


def apply_constraints(engine: Engine):
    console.print("\n[header]Applying Constraints[/]")
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for sql in CONSTRAINTS_SQL:
            conn.execute(text(sql))
            logger.debug(f"  Applied: {sql[:60]}...")
    console.print("[success]Constraints applied.[/]")


def apply_indexes(engine: Engine, target_tables: List[str] = None):
    console.print("\n[header]Applying Indexes[/]")
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))

    tables_to_run = target_tables or list(TABLE_DEFS.keys())

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=30),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Indexing...", total=len(tables_to_run))

        def index_table(table):
            defn = TABLE_DEFS.get(table)
            if not defn or not defn.get("indexes"):
                return
            with engine.connect() as conn:
                conn.execution_options(isolation_level="AUTOCOMMIT")
                for sql in defn["indexes"]:
                    conn.execute(text(sql))

        with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables_to_run)))) as executor:
            futures = [executor.submit(index_table, t) for t in tables_to_run]
            for _ in concurrent.futures.as_completed(futures):
                progress.advance(task)

    console.print("[success]Indexes applied.[/]")


def run_import(
    engine: Engine, full_schema: Dict, target_tables: List[str] = None, dry_run: bool = False,
) -> List[str]:
    try:
        gc = get_gspread_client()
    except Exception as e:
        raise RuntimeError(f"Google Sheets auth failed: {e}") from e

    loaded: List[str] = []
    total_change_events = 0
    import_run_id: Optional[int] = None

    if target_tables:
        tables = [t for t in IMPORT_ORDER if t in full_schema and t in target_tables]
    else:
        tables = [t for t in IMPORT_ORDER if t in full_schema]

    table_tracked_fields: Dict[str, List[str]] = {}
    old_snapshots: Dict[str, pd.DataFrame] = {}
    track_lifecycle = True

    if dry_run:
        console.print(Panel("[warning]DRY-RUN MODE[/] - No DB writes will be executed", expand=False))
    else:
        ensure_notification_tables(engine)
        track_lifecycle = has_completed_import_baseline(engine)
        if not track_lifecycle:
            logger.info("Lifecycle events skipped: no completed baseline import exists yet.")
        import_run_id = create_import_run(engine, IMPORT_SOURCE, tables)
        if import_run_id is None:
            raise RuntimeError("Could not create import run record.")

    # Pre-capture old snapshots
    for table in tables:
        tracked_fields = get_tracked_table_fields(full_schema, table)
        table_tracked_fields[table] = tracked_fields
        if tracked_fields or table in LIFECYCLE_EVENT_TABLES:
            old_snapshots[table] = fetch_existing_table_snapshot(engine, table, tracked_fields)

    # Summary table for results
    summary = Table(title="[header]Import Results[/]", show_lines=True)
    summary.add_column("Table", style="table_name")
    summary.add_column("Rows", justify="right")
    summary.add_column("Time (s)", justify="right")
    summary.add_column("Field Changes", justify="right")
    summary.add_column("Added", justify="right", style="green")
    summary.add_column("Removed", justify="right", style="red")
    summary.add_column("Status", justify="center")

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=30),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            summary_lock = threading.Lock()
            task_ids = {}
            for t in tables:
                task_ids[t] = progress.add_task(f"[dim]Queued:[/] [table_name]{t}[/]", total=None, start=False)

            def process_table(table):
                task_id = task_ids[table]
                progress.update(task_id, description=f"Downloading: [table_name]{table}[/]")
                progress.start_task(task_id)

                ws_name = WORKSHEET_MAP.get(table)
                if not ws_name:
                    raise RuntimeError(f"No worksheet mapping for table '{table}'.")

                start_time = time.perf_counter()

                ws = gc.open_by_key(SPREADSHEET_ID).worksheet(ws_name)
                df = get_as_dataframe(ws, evaluate_formulas=True, header=0)

                if df is not None:
                    df = df.dropna(how="all").loc[:, ~df.columns.astype(str).str.match(r"^Unnamed")]
                if df is None or df.empty:
                    raise RuntimeError(f"Worksheet '{ws_name}' is empty.")

                progress.update(task_id, description=f"Cleaning: [table_name]{table}[/]")
                df_clean = clean_dataframe(df, full_schema[table])
                tracked_fields = table_tracked_fields.get(table, [])
                table_field_events: List[Dict] = []
                table_lifecycle_events: List[Dict] = []
                table_events: List[Dict] = []
                common_count = 0
                added_count = 0
                removed_count = 0
                old_snapshot = old_snapshots.get(table, pd.DataFrame())

                if tracked_fields or (table in LIFECYCLE_EVENT_TABLES and track_lifecycle):
                    progress.update(task_id, description=f"Diffing: [table_name]{table}[/]")

                if tracked_fields:
                    common_count = get_common_record_count(old_snapshot, df_clean, table)
                    table_field_events = compute_table_field_changes(old_snapshot, df_clean, table, tracked_fields)
                    table_events.extend(table_field_events)

                if table in LIFECYCLE_EVENT_TABLES and track_lifecycle:
                    table_lifecycle_events = compute_table_lifecycle_events(old_snapshot, df_clean, table)
                    added_count = sum(1 for ev in table_lifecycle_events if ev["field_name"] == ROW_ADDED_FIELD)
                    removed_count = sum(1 for ev in table_lifecycle_events if ev["field_name"] == ROW_REMOVED_FIELD)
                    table_events.extend(table_lifecycle_events)

                dtypes = {
                    c["Column"]: TYPE_MAPPING.get(c["Type"].upper(), Text)
                    for c in full_schema[table]["columns"]
                }

                elapsed = round(time.perf_counter() - start_time, 2)

                if dry_run:
                    with summary_lock:
                        summary.add_row(
                            table, str(len(df_clean)), str(elapsed),
                            str(len(table_field_events)), str(added_count), str(removed_count),
                            "[warning]DRY-RUN[/]",
                        )
                        loaded.append(table)
                    progress.update(task_id, completed=1, total=1, description=f"[success]Done:[/] [table_name]{table}[/]")
                    return 0

                progress.update(task_id, description=f"Writing to DB: [table_name]{table}[/]")
                with engine.connect() as conn:
                    conn.execution_options(isolation_level="AUTOCOMMIT")
                    conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))

                df_clean.to_sql(
                    table, engine, if_exists="replace", index=False,
                    method="multi", chunksize=CHUNKSIZE, dtype=dtypes,
                )

                elapsed = round(time.perf_counter() - start_time, 2)

                inserted = 0
                if table_events and import_run_id is not None:
                    progress.update(task_id, description=f"Logging Events: [table_name]{table}[/]")
                    inserted = insert_change_events(engine, import_run_id, table_events)

                with summary_lock:
                    loaded.append(table)
                    summary.add_row(
                        table, str(len(df_clean)), str(elapsed),
                        str(len(table_field_events)), str(added_count), str(removed_count),
                        "[success]OK[/]",
                    )
                
                progress.update(task_id, completed=1, total=1, description=f"[success]Done:[/] [table_name]{table}[/]")
                return inserted

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables)))) as executor:
                futures = [executor.submit(process_table, t) for t in tables]
                for future in concurrent.futures.as_completed(futures):
                    total_change_events += future.result()

        console.print(summary)

        if dry_run:
            return loaded

        if loaded:
            apply_constraints(engine)
            apply_indexes(engine, loaded)

        if import_run_id is not None:
            finalize_import_run(
                engine, import_run_id, status="completed",
                tables_loaded=len(loaded), change_events_logged=total_change_events,
            )
            cleanup_old_change_events(engine)

        return loaded
    except Exception as e:
        logger.exception(f"Import aborted: {e}")
        if import_run_id is not None and not dry_run:
            finalize_import_run(
                engine, import_run_id, status="failed",
                tables_loaded=len(loaded), change_events_logged=total_change_events,
                error_message=str(e)[:1000],
            )
        raise


def run_snapshot(engine: Engine, tables: List[str]):
    console.print(Panel("[header]Schema Snapshot[/]", expand=False))
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)

    inspector = inspect(engine)
    snapshot = {}

    snap_table = Table(title="[header]DB Table Stats[/]", show_lines=True)
    snap_table.add_column("Table", style="table_name")
    snap_table.add_column("Columns", justify="right")
    snap_table.add_column("Rows", justify="right")
    snap_table.add_column("Size (MB)", justify="right")

    for table in tables:
        if not inspector.has_table(table):
            continue

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

        try:
            with engine.connect() as conn:
                rows = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0
                size_res = conn.execute(text(f"SELECT pg_total_relation_size('{table}')")).scalar() or 0
                size_mb = round(size_res / (1024 ** 2), 3)
        except Exception:
            rows, size_mb = 0, 0

        snapshot[table] = {
            "columns": cols,
            "statistics": {"Table": table, "Rows": rows, "Size (MB)": size_mb},
        }
        snap_table.add_row(table, str(len(cols)), str(rows), str(size_mb))

    console.print(snap_table)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(SNAPSHOT_OUTPUT_DIR, f"schema_{timestamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    console.print(f"[dim]Snapshot saved: {path}[/]")


def run_validate(engine: Engine, schema_def: Dict, target_tables: List[str] = None):
    console.print(Panel("[header]Schema Validation[/]", expand=False))
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    all_ok = True

    tables_to_check = target_tables or list(schema_def.keys())

    val_table = Table(title="[header]Validation Results[/]", show_lines=True)
    val_table.add_column("Table", style="table_name")
    val_table.add_column("Column")
    val_table.add_column("Expected Type")
    val_table.add_column("DB Type")
    val_table.add_column("Status", justify="center")

    for table, defs in schema_def.items():
        if table not in tables_to_check:
            continue

        if table not in db_tables:
            val_table.add_row(table, "-", "-", "-", "[error]MISSING TABLE[/]")
            all_ok = False
            continue

        db_cols = {c["name"]: str(c["type"]).upper() for c in inspector.get_columns(table)}

        for col_def in defs["columns"]:
            cname = col_def["Column"]
            ctype = col_def["Type"].upper()

            if cname not in db_cols:
                val_table.add_row(table, cname, ctype, "-", "[error]MISSING[/]")
                all_ok = False
                continue

            db_type = db_cols[cname]
            match = (
                ctype in db_type
                or (ctype == "FLOAT" and "DOUBLE" in db_type)
                or (ctype == "VARCHAR" and "TEXT" in db_type)
            )

            if match:
                val_table.add_row(table, cname, ctype, db_type, "[success]OK[/]")
            else:
                val_table.add_row(table, cname, ctype, db_type, "[warning]TYPE MISMATCH[/]")

    console.print(val_table)

    if all_ok:
        console.print("[success]Schema validation passed.[/]")
    else:
        console.print("[error]Schema validation found issues.[/]")
        raise RuntimeError("Schema validation failed.")


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Unified Data Manager (Import, Validate, Snapshot)")
    parser.add_argument("--import", dest="run_import", action="store_true", help="Run Import from Sheets")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", help="Import flow without DB writes")
    parser.add_argument("--validate", dest="run_validate", action="store_true", help="Validate Database Schema")
    parser.add_argument("--schema", dest="run_snapshot", action="store_true", help="Take Schema Snapshot")
    parser.add_argument("--index", dest="run_index", action="store_true", help="Apply DB Indexes")
    parser.add_argument("--check-headers", dest="check_headers", action="store_true", help="Diff Sheet headers vs schema")
    parser.add_argument("--table", "-t", dest="target_table", help="Target a specific table (e.g., 'centers')")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    if args.verbose:
        global logger
        logger = setup_logger(verbose=True)

    console.print(Panel.fit(
        "[header]Unified Data Manager[/]\n[dim]Import | Validate | Snapshot[/]",
        border_style="cyan",
    ))

    mode_selected = args.run_import or args.run_validate or args.run_snapshot or args.run_index or args.check_headers

    if not mode_selected and not args.dry_run:
        args.run_import = True
        args.run_validate = True
        args.run_index = True
    elif args.dry_run and not mode_selected:
        args.run_import = True

    full_schema = load_schema_def()

    target_tables = None
    if args.target_table:
        if args.target_table not in full_schema:
            console.print(f"[error]Unknown table '{args.target_table}'. Available: {list(full_schema.keys())}[/]")
            sys.exit(1)
        target_tables = [args.target_table]
        console.print(f"[info]Targeting single table:[/] [table_name]{args.target_table}[/]")

    # --check-headers
    if args.check_headers:
        headers_ok = check_sheet_headers(full_schema, target_tables)
        if not headers_ok:
            sys.exit(1)
        if not (args.run_import or args.run_validate or args.run_snapshot or args.run_index):
            console.print("[success]Done.[/]")
            return

    if args.dry_run and args.run_index and not args.run_import:
        console.print("[error]--dry-run cannot be combined with standalone --index.[/]")
        sys.exit(1)

    # DB connection
    try:
        engine = get_engine()
        with engine.connect():
            pass
        console.print("[success]Database connected.[/]")
    except Exception as e:
        console.print(f"[error]Database connection failed: {e}[/]")
        sys.exit(1)

    # Pre-flight header check
    if args.run_import:
        label = "Pre-flight (dry-run)" if args.dry_run else "Pre-flight"
        console.print(f"\n[header]{label}: Validating headers...[/]")
        if not check_sheet_headers(full_schema, target_tables):
            console.print("[error]Aborting import - headers do not match schema.[/]")
            engine.dispose()
            sys.exit(1)

    processed_tables = target_tables or list(full_schema.keys())

    if args.run_import:
        console.print(Panel("[header]MODE: IMPORT" + (" (DRY-RUN)" if args.dry_run else "") + "[/]", expand=False))
        processed_tables = run_import(engine, full_schema, target_tables, dry_run=args.dry_run)

    if args.run_index and not args.run_import:
        console.print(Panel("[header]MODE: INDEX[/]", expand=False))
        apply_indexes(engine, target_tables)

    if args.run_snapshot or (args.run_import and not args.dry_run):
        run_snapshot(engine, processed_tables)

    if args.run_validate:
        run_validate(engine, full_schema, target_tables)

    engine.dispose()
    console.print("\n[success]All done.[/]")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopping...[/]", end=" ")
        time.sleep(0.3)
        console.print("[dim]Stopped.[/]")
        sys.exit(130)
    except Exception as e:
        console.print(f"\n[error]Unexpected error: {e}[/]")
        sys.exit(1)
