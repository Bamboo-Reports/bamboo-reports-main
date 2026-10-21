"""The import itself: download each worksheet, clean it, diff it against
the current table, then replace the table and log the changes."""

import concurrent.futures
import threading
import time
from typing import Dict, List, Optional

import pandas as pd
from gspread_dataframe import get_as_dataframe
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.types import Text

from common import tui
from common.env import SPREADSHEET_ID
from common.google import get_gspread_client
from common.tui import console

from .changes import (
    cleanup_old_change_events,
    compute_table_field_changes,
    compute_table_lifecycle_events,
    create_import_run,
    ensure_notification_tables,
    fetch_existing_table_snapshot,
    finalize_import_run,
    has_completed_import_baseline,
    insert_change_events,
)
from .cleaning import clean_dataframe
from .config import CHUNKSIZE, IMPORT_SOURCE, ROW_ADDED_FIELD, ROW_REMOVED_FIELD
from .database import analyze_tables, apply_constraints, apply_indexes
from .logs import logger, record_stage
from .tables import IMPORT_ORDER, LIFECYCLE_EVENT_TABLES, TYPE_MAPPING, WORKSHEET_MAP, get_tracked_table_fields


def run_import(
    engine: Engine, full_schema: Dict, target_tables: List[str] = None, dry_run: bool = False,
) -> List[str]:
    try:
        gc = get_gspread_client()
    except Exception as e:
        raise RuntimeError(f"Google Sheets auth failed: {e}") from e

    tui.section("Import · Google Sheets to database" + (" (dry run)" if dry_run else ""))

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

    if not dry_run:
        ensure_notification_tables(engine)
        track_lifecycle = has_completed_import_baseline(engine)
        if not track_lifecycle:
            logger.info("Added/removed rows are not logged this time: no completed baseline import exists yet.")
        import_run_id = create_import_run(engine, IMPORT_SOURCE, tables)
        if import_run_id is None:
            raise RuntimeError("Could not create import run record.")

    # Pre-capture old snapshots
    with console.status("Reading current tables for change tracking ...", spinner_style="info"):
        for table in tables:
            tracked_fields = get_tracked_table_fields(full_schema, table)
            table_tracked_fields[table] = tracked_fields
            if tracked_fields or table in LIFECYCLE_EVENT_TABLES:
                old_snapshots[table] = fetch_existing_table_snapshot(engine, table, tracked_fields)

    # One result row per table, printed in import order once all finish.
    results: Dict[str, tuple] = {}
    results_lock = threading.Lock()
    timer = tui.Timer()

    try:
        with tui.progress(counts=False) as progress:
            task_ids = {}
            for t in tables:
                task_ids[t] = progress.add_task(f"[muted]Queued[/]  {t}", total=None, start=False)

            def stage(table, label):
                progress.update(task_ids[table], description=f"{label:<12} {table}")

            def process_table(table):
                task_id = task_ids[table]
                stage(table, "Downloading")
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

                stage(table, "Cleaning")
                df_clean = clean_dataframe(df, full_schema[table])
                tracked_fields = table_tracked_fields.get(table, [])
                table_field_events: List[Dict] = []
                table_lifecycle_events: List[Dict] = []
                table_events: List[Dict] = []
                added_count = 0
                removed_count = 0
                old_snapshot = old_snapshots.get(table, pd.DataFrame())

                if tracked_fields or (table in LIFECYCLE_EVENT_TABLES and track_lifecycle):
                    stage(table, "Diffing")

                if tracked_fields:
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

                if dry_run:
                    elapsed = time.perf_counter() - start_time
                    with results_lock:
                        results[table] = (len(df_clean), elapsed, len(table_field_events), added_count, removed_count)
                        loaded.append(table)
                    progress.update(task_id, completed=1, total=1, description=f"[success]Done[/]  {table}")
                    return 0

                stage(table, "Writing")
                with engine.connect() as conn:
                    conn.execution_options(isolation_level="AUTOCOMMIT")
                    conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))

                df_clean.to_sql(
                    table, engine, if_exists="replace", index=False,
                    method="multi", chunksize=CHUNKSIZE, dtype=dtypes,
                )

                elapsed = time.perf_counter() - start_time

                inserted = 0
                if table_events and import_run_id is not None:
                    stage(table, "Logging")
                    inserted = insert_change_events(engine, import_run_id, table_events)

                with results_lock:
                    loaded.append(table)
                    results[table] = (len(df_clean), elapsed, len(table_field_events), added_count, removed_count)

                progress.update(task_id, completed=1, total=1, description=f"[success]Done[/]  {table}")
                return inserted

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables)))) as executor:
                futures = [executor.submit(process_table, t) for t in tables]
                for future in concurrent.futures.as_completed(futures):
                    total_change_events += future.result()

        summary = tui.table("Table", "Rows#", "Time#", "Field changes#", "Added#", "Removed#", "")
        for table in tables:
            if table not in results:
                continue
            rows, elapsed, changes, added, removed = results[table]
            summary.add_row(
                table,
                tui.num(rows),
                f"{elapsed:.1f}s",
                tui.num(changes) if changes else "[muted]0[/muted]",
                f"[success]{tui.num(added)}[/success]" if added else "[muted]0[/muted]",
                f"[error]{tui.num(removed)}[/error]" if removed else "[muted]0[/muted]",
                tui.ICONS["pass"],
            )
        tui.print_table(summary)

        total_rows = sum(r[0] for r in results.values())
        verb = "Read" if dry_run else "Loaded"
        detail = f"{tui.plural(len(loaded), 'table')}, {tui.plural(total_rows, 'row')} in {timer}"
        if not dry_run:
            detail += f", {tui.plural(total_change_events, 'change event')} logged"
        tui.line("pass", f"{verb} {detail}.")
        record_stage("Import" + (" (dry run)" if dry_run else ""), "pass", detail)

        if dry_run:
            return loaded

        if loaded:
            tui.section("Database · constraints and indexes")
            apply_constraints(engine)
            apply_indexes(engine, loaded)
            analyze_tables(engine, loaded)
            record_stage("Indexes", "pass", f"constraints and indexes on {tui.plural(len(loaded), 'table')}")

        if import_run_id is not None:
            finalize_import_run(
                engine, import_run_id, status="completed",
                tables_loaded=len(loaded), change_events_logged=total_change_events,
            )
            cleanup_old_change_events(engine)

        return loaded
    except Exception as e:
        logger.exception(f"Import aborted: {e}")
        record_stage("Import", "fail", str(e)[:120])
        if import_run_id is not None and not dry_run:
            finalize_import_run(
                engine, import_run_id, status="failed",
                tables_loaded=len(loaded), change_events_logged=total_change_events,
                error_message=str(e)[:1000],
            )
        raise
