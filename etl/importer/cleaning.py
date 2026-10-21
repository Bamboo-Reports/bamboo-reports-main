"""Cleaning sheet data into schema types, and the value normalisation the
change tracking compares on."""

import datetime
import math
import re
from decimal import Decimal
from numbers import Integral, Real
from typing import Any, Dict, List, Optional

import pandas as pd

# Invisible characters (zero-width, BOM, soft hyphen, bidi controls) are
# stripped from every value. The list lives in sheets.rules so the import
# strips exactly what validate flags and cleanup removes (it once kept a
# shorter copy that missed the bidi marks).
from sheets.rules import INVISIBLE_CHARS_RE

from .logs import logger
from .tables import TABLE_PRIMARY_ID_COLUMNS, TABLE_SECONDARY_ID_COLUMNS

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
                    pd.to_numeric(
                        series.astype(str)
                        .str.replace(INVISIBLE_CHARS_RE, "", regex=True)
                        .str.replace(",", ""),
                        errors="coerce",
                    )
                    .round()
                    .astype("Int64")
                )
            elif ctype in ("DOUBLE PRECISION", "FLOAT"):
                df[col_name] = pd.to_numeric(
                    series.astype(str)
                    .str.replace(INVISIBLE_CHARS_RE, "", regex=True)
                    .str.replace(",", ""),
                    errors="coerce",
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

    value_str = INVISIBLE_CHARS_RE.sub("", str(value)).strip()
    if value_str.lower() in {"nan", "none", "null", "nat"}:
        return None
    return value_str if value_str else None


INTEGER_FLOAT_TEXT_RE = re.compile(r"^([+-]?\d+)\.0+$")
INTEGER_FLOAT_TEXT_COLUMNS = ("zip", "postal", "postcode", "year", "phone")


def normalize_text_value(value: Any, col_name: str) -> Optional[str]:
    if any(marker in col_name.lower() for marker in INTEGER_FLOAT_TEXT_COLUMNS):
        normalized = normalize_change_value(value)
        if normalized is None:
            return None
        match = INTEGER_FLOAT_TEXT_RE.fullmatch(normalized.replace(",", ""))
        if match:
            return match.group(1)
        return normalized

    value_str = INVISIBLE_CHARS_RE.sub("", str(value)).strip()
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
