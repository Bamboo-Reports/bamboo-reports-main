"""
Command line entry point for the importer.

  uv run --directory etl python -m importer                  # dev: import, snapshot, schema check, indexes
  uv run --directory etl python -m importer --target prod    # the same against prod, then purge the cache
  ... --import / --dry-run / --validate / --schema / --index / --check-headers
  ... --table centers / --no-purge / --verbose

--target picks DATABASE_URL_DEV (default) or DATABASE_URL_PROD from etl/.env.
The dashboard cache purge only runs on prod imports, and --no-purge skips it.
"""

import argparse
import os
import sys
from typing import List

from common import tui
from common.env import require
from common.tui import console

from . import logs
from .cache import purge_dashboard_cache
from .config import DATABASE_URLS
from .database import analyze_tables, apply_indexes, database_host, get_engine, run_snapshot, run_validate
from .headers import check_sheet_headers
from .load import run_import
from .logs import STAGES, logger, record_stage, setup_logger
from .tables import TABLE_DEFS, load_schema_def


def finish(ok: bool, headline: str, next_steps: List[str]) -> None:
    """Closing summary of every stage that ran, then the verdict panel."""
    tui.section("Summary")
    tui.summary([("", name, status, detail) for name, status, detail in STAGES])
    worst = "fail" if not ok else "warn" if any(s == "warn" for _, s, _ in STAGES) else "pass"
    tui.verdict(worst, headline, next_steps)


def main():
    parser = argparse.ArgumentParser(prog="python -m importer", description="Unified Data Manager (Import, Validate, Snapshot)")
    parser.add_argument("--import", dest="run_import", action="store_true", help="Run Import from Sheets")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", help="Import flow without DB writes")
    parser.add_argument("--validate", dest="run_validate", action="store_true", help="Validate Database Schema")
    parser.add_argument("--schema", dest="run_snapshot", action="store_true", help="Take Schema Snapshot")
    parser.add_argument("--index", dest="run_index", action="store_true", help="Apply DB Indexes")
    parser.add_argument("--check-headers", dest="check_headers", action="store_true", help="Diff Sheet headers vs schema")
    parser.add_argument("--table", "-t", dest="target_table", help="Target a specific table (e.g., 'centers')")
    parser.add_argument("--target", choices=("dev", "prod"), default="dev",
                        help="Database to use: dev (default) or prod")
    parser.add_argument("--no-purge", dest="no_purge", action="store_true",
                        help="Do not purge the dashboard cache after a prod import")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    require("SPREADSHEET_ID")
    url = DATABASE_URLS[args.target]
    if not url:
        console.print(f"[error]DATABASE_URL_{args.target.upper()} not set in etl/.env[/]")
        sys.exit(1)
    purge = args.target == "prod" and not args.no_purge

    setup_logger(verbose=args.verbose)

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

    if args.dry_run and args.run_index and not args.run_import:
        console.print("[error]--dry-run cannot be combined with standalone --index.[/]")
        sys.exit(1)

    # The stages this run will go through, for the header.
    plan: List[str] = []
    if args.check_headers or args.run_import:
        plan.append("headers")
    if args.run_import:
        plan.append("import (dry run)" if args.dry_run else "import")
    if args.run_import and not args.dry_run:
        plan += ["indexes", "cache purge"] if purge else ["indexes"]
    elif args.run_index:
        plan.append("indexes")
    if args.run_snapshot or (args.run_import and not args.dry_run):
        plan.append("snapshot")
    if args.run_validate:
        plan.append("schema check")
    tui.header(
        "ETL · import",
        [
            ("Target", "[error]prod[/error]" if args.target == "prod" else "dev"),
            ("Database", database_host(url)),
            ("Tables", args.target_table or "all"),
            (
                "Mode",
                "[warning]dry run: nothing is written to the database[/warning]"
                if args.dry_run
                else ("[error]writes to the database[/error]" if args.run_import or args.run_index else "read-only"),
            ),
            ("Stages", " → ".join(plan)),
            ("Log file", os.path.relpath(logs.LOG_FILE)),
        ],
    )

    # --check-headers
    if args.check_headers:
        if not check_sheet_headers(full_schema, target_tables):
            finish(False, "Header check failed", ["Fix the sheet headers listed above, then run again."])
            sys.exit(1)
        if not (args.run_import or args.run_validate or args.run_snapshot or args.run_index):
            finish(True, "Headers match the schema", [])
            return

    # DB connection
    try:
        with console.status("Connecting to the database ...", spinner_style="info"):
            engine = get_engine(url)
            with engine.connect():
                pass
        tui.line("pass", f"Connected to {database_host(url)}.")
    except Exception as e:
        tui.line("fail", f"Database connection failed: {e}")
        sys.exit(1)

    try:
        # Pre-flight header check
        if args.run_import and not args.check_headers:
            if not check_sheet_headers(full_schema, target_tables):
                finish(False, "Import not started · sheet headers do not match the schema",
                       ["Fix the sheet headers listed above, then run again."])
                engine.dispose()
                sys.exit(1)

        processed_tables = target_tables or list(full_schema.keys())

        if args.run_import:
            processed_tables = run_import(engine, full_schema, target_tables, dry_run=args.dry_run)
            if not args.dry_run:
                if purge:
                    purge_dashboard_cache()
                else:
                    # The shared dashboard cache serves prod, so a dev import
                    # must not empty it.
                    reason = "--no-purge was given" if args.no_purge else "the dashboard cache belongs to prod, this run targets dev"
                    tui.section("Cache · dashboard responses")
                    tui.line("skip", f"Cache purge skipped: {reason}.")
                    record_stage("Cache purge", "skip", "--no-purge" if args.no_purge else "dev target")

        if args.run_index and not args.run_import:
            tui.section("Database · indexes")
            apply_indexes(engine, target_tables)
            analyze_tables(engine, target_tables)
            record_stage("Indexes", "pass", f"indexes on {tui.plural(len(target_tables or TABLE_DEFS), 'table')}")

        if args.run_snapshot or (args.run_import and not args.dry_run):
            run_snapshot(engine, processed_tables)

        if args.run_validate:
            run_validate(engine, full_schema, target_tables)
    except Exception as e:
        engine.dispose()
        logger.debug("Run failed", exc_info=True)
        finish(False, f"Failed · {str(e)[:70]}", [f"Full details: {os.path.relpath(logs.LOG_FILE)}"])
        sys.exit(1)

    engine.dispose()
    if args.dry_run:
        finish(True, "Dry run complete · nothing was written", ["Run without --dry-run to import."])
    elif args.run_import:
        finish(True, "Import complete", [])
    else:
        finish(True, f"Finished · {tui.plural(len(STAGES), 'stage')} passed", [])


def run() -> None:
    """main() with the top-level handling for Ctrl-C and unexpected errors."""
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped.[/warning]")
        sys.exit(130)
    except Exception as e:
        tui.line("fail", f"Unexpected error: {e}")
        if logs.LOG_FILE:
            tui.note(f"Full details: {os.path.relpath(logs.LOG_FILE)}", indent=4)
        logger.debug("Unexpected error", exc_info=True)
        sys.exit(1)
