"""Table definitions, the single source of truth for what the importer
loads: worksheet, identity columns for change tracking, indexes, import
order and constraints. Column types come from master-schema.json."""

import json
import os
from typing import Any, Dict, List

from sqlalchemy.types import TIMESTAMP, BigInteger, Boolean, Float, Integer, Text

from .config import ACCOUNT_UUID_COLUMN, SCHEMA_FILE

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
    "ticker": {
        "worksheet": "ticker",
        "primary_id": ["account_global_legal_name"],
        "secondary_id": ["account_global_legal_name"],
        "label_cols": ["account_global_legal_name", "account_hq_stock_ticker"],
        "track_changes": True,
        "track_lifecycle": True,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS ticker_account_name_idx ON public.ticker (account_global_legal_name);",
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
            "CREATE INDEX IF NOT EXISTS prospects_engaged_idx ON public.prospects (prospect_engaged);",
            "CREATE INDEX IF NOT EXISTS prospects_head_type_idx ON public.prospects (head_type);",
            "CREATE INDEX IF NOT EXISTS prospects_center_name_idx ON public.prospects (center_name);",
            "CREATE INDEX IF NOT EXISTS prospects_city_idx ON public.prospects (prospect_city);",
            "CREATE INDEX IF NOT EXISTS prospects_title_trgm_idx ON public.prospects USING gin (prospect_title gin_trgm_ops);",
            "CREATE INDEX IF NOT EXISTS prospects_account_name_idx ON public.prospects (account_global_legal_name);",
            "CREATE INDEX IF NOT EXISTS prospects_email_lower_idx ON public.prospects (lower(prospect_email));",
        ],
    },
    # One row per campaign engagement, so uuid repeats and there is no primary
    # key. Linked to prospects by prospect_email, not a foreign key: prospect
    # emails are not unique in the sheet and some differ only by case, so join
    # on lower(prospect_email) (indexed on both sides).
    "subscribers": {
        "worksheet": "subscribers",
        "primary_id": [],
        "secondary_id": [],
        "label_cols": ["prospect_email", "prospect_engaged_campaign"],
        "track_changes": False,
        "track_lifecycle": False,
        "indexes": [
            "CREATE INDEX IF NOT EXISTS subscribers_email_lower_idx ON public.subscribers (lower(prospect_email));",
            "CREATE INDEX IF NOT EXISTS subscribers_campaign_idx ON public.subscribers (prospect_engaged_campaign);",
        ],
    },
}

IMPORT_ORDER = ["accounts", "ticker", "alias", "centers", "services", "functions", "tech", "prospects", "subscribers"]

CONSTRAINTS_SQL = [
    "ALTER TABLE accounts ADD PRIMARY KEY (account_global_legal_name);",
    "ALTER TABLE alias ADD CONSTRAINT fk_alias_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON UPDATE CASCADE ON DELETE CASCADE;",
    "ALTER TABLE ticker ADD PRIMARY KEY (account_global_legal_name);",
    "ALTER TABLE ticker ADD CONSTRAINT fk_tkr_acc FOREIGN KEY (account_global_legal_name) REFERENCES accounts (account_global_legal_name) ON UPDATE CASCADE ON DELETE CASCADE;",
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


# ── Helpers ──────────────────────────────────────────────────────────────────


def load_schema_def() -> Dict[str, Any]:
    if not os.path.exists(SCHEMA_FILE):
        raise FileNotFoundError(f"Schema definition missing: {SCHEMA_FILE}")
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_tracked_table_fields(schema_def: Dict[str, Any], table: str) -> List[str]:
    if table not in TRACKED_EVENT_TABLES:
        return []
    table_columns = [c["Column"] for c in schema_def.get(table, {}).get("columns", [])]
    identity_cols = set(TABLE_PRIMARY_ID_COLUMNS.get(table, []))
    return [col for col in table_columns if col != ACCOUNT_UUID_COLUMN and col not in identity_cols]
