"""Database work around the load: engine, constraints, indexes, ANALYZE,
the schema snapshot and the schema check."""

import concurrent.futures
import datetime
import json
import os
import urllib.parse
from typing import Dict, List

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from common import tui
from common.tui import console

from .config import SNAPSHOT_OUTPUT_DIR
from .logs import logger, record_stage
from .tables import CONSTRAINTS_SQL, TABLE_DEFS


def get_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True)


def database_host(url: str) -> str:
    """Host and database name from the connection string, without the
    credentials, for the header."""
    parsed = urllib.parse.urlparse(url)
    name = parsed.path.lstrip("/")
    return f"{parsed.hostname or '?'}" + (f" / {name}" if name else "")


# ── Actions ──────────────────────────────────────────────────────────────────


def apply_constraints(engine: Engine):
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for sql in CONSTRAINTS_SQL:
            conn.execute(text(sql))
            logger.debug(f"  Applied: {sql[:60]}...")
    tui.line("pass", "Constraints applied.")


def analyze_tables(engine: Engine, target_tables: List[str] = None):
    """Refreshes planner statistics for the reloaded tables.

    The import drops and recreates each table, which leaves it with no
    statistics until autovacuum's analyze runs (a minute or more later). The
    cache purge that follows makes every dashboard request recompute in that
    window, and the filter SQL relies on column statistics to pick hash joins
    over nested loops, so run ANALYZE before the purge rather than waiting.
    """
    tables_to_run = target_tables or list(TABLE_DEFS.keys())
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        for table in tables_to_run:
            conn.execute(text(f"ANALYZE public.{table};"))
    tui.line("pass", "Statistics refreshed (ANALYZE).")


def apply_indexes(engine: Engine, target_tables: List[str] = None):
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))

    tables_to_run = target_tables or list(TABLE_DEFS.keys())
    timer = tui.Timer()

    def index_table(table):
        defn = TABLE_DEFS.get(table)
        if not defn or not defn.get("indexes"):
            return 0
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            for sql in defn["indexes"]:
                conn.execute(text(sql))
        return len(defn["indexes"])

    created = 0
    with tui.progress() as progress:
        task = progress.add_task("Building indexes", total=len(tables_to_run))
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables_to_run)))) as executor:
            futures = [executor.submit(index_table, t) for t in tables_to_run]
            for future in concurrent.futures.as_completed(futures):
                created += future.result()
                progress.advance(task)

    tui.line(
        "pass",
        f"Indexes applied: {tui.plural(created, 'index', 'indexes')} on "
        f"{tui.plural(len(tables_to_run), 'table')} in {timer}.",
    )


def run_snapshot(engine: Engine, tables: List[str]):
    tui.section("Snapshot · database tables")
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)

    inspector = inspect(engine)
    snapshot = {}

    snap_table = tui.table("Table", "Columns#", "Rows#", "Size (MB)#")

    with console.status("Reading table stats ...", spinner_style="info"):
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
            snap_table.add_row(table, str(len(cols)), tui.num(rows), f"{size_mb:,.1f}")

    tui.print_table(snap_table)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(SNAPSHOT_OUTPUT_DIR, f"schema_{timestamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    tui.note(f"Saved to {os.path.relpath(path)}", indent=2)
    total_mb = sum(s["statistics"]["Size (MB)"] for s in snapshot.values())
    record_stage("Snapshot", "pass", f"{tui.plural(len(snapshot), 'table')}, {total_mb:,.0f} MB")


def run_validate(engine: Engine, schema_def: Dict, target_tables: List[str] = None):
    """Compare the database's columns and types with master-schema.json.
    A missing table or column fails; a type mismatch is a warning."""
    tui.section("Schema check · database vs master-schema.json")
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())
    all_ok = True

    tables_to_check = target_tables or list(schema_def.keys())

    overview = tui.table("Table", "Columns#", "Missing#", "Type mismatches#", "")
    problems: List[tuple] = []
    mismatches = 0

    for table, defs in schema_def.items():
        if table not in tables_to_check:
            continue

        if table not in db_tables:
            overview.add_row(table, "-", "-", "-", f"{tui.ICONS['fail']} table missing")
            all_ok = False
            continue

        db_cols = {c["name"]: str(c["type"]).upper() for c in inspector.get_columns(table)}
        missing = 0
        wrong_type = 0

        for col_def in defs["columns"]:
            cname = col_def["Column"]
            ctype = col_def["Type"].upper()

            if cname not in db_cols:
                missing += 1
                problems.append((table, cname, ctype, "[muted]missing[/muted]", tui.ICONS["fail"]))
                all_ok = False
                continue

            db_type = db_cols[cname]
            match = (
                ctype in db_type
                or (ctype == "FLOAT" and "DOUBLE" in db_type)
                or (ctype == "VARCHAR" and "TEXT" in db_type)
            )
            if not match:
                wrong_type += 1
                problems.append((table, cname, ctype, db_type, tui.ICONS["warn"]))

        mismatches += wrong_type
        overview.add_row(
            table,
            str(len(defs["columns"])),
            str(missing) if missing else "[muted]0[/muted]",
            str(wrong_type) if wrong_type else "[muted]0[/muted]",
            tui.ICONS[tui.status_of(missing, wrong_type)],
        )

    tui.print_table(overview)
    if problems:
        details = tui.table("Table", "Column", "Expected", "In database", "", title="Columns that differ")
        for row in problems:
            details.add_row(*row)
        tui.print_table(details)

    if all_ok:
        record_stage(
            "Schema check",
            "warn" if mismatches else "pass",
            f"{tui.plural(mismatches, 'type mismatch', 'type mismatches')}" if mismatches else "database matches the schema",
        )
    else:
        record_stage("Schema check", "fail", "tables or columns missing from the database")
        raise RuntimeError("Schema validation failed.")
