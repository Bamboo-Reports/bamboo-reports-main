"""Pre-flight check: each worksheet's header row against master-schema.json."""

import concurrent.futures
from typing import Any, Dict, List

from common import tui
from common.env import SPREADSHEET_ID
from common.google import get_gspread_client
from common.tui import console

from .logs import logger, record_stage
from .tables import IMPORT_ORDER, WORKSHEET_MAP

# ── Header Checking ──────────────────────────────────────────────────────────


def check_sheet_headers(schema_def: Dict[str, Any], target_tables: List[str] = None) -> bool:
    """Compare each worksheet's header row with the schema. Missing or
    duplicated columns fail; extra sheet columns are only a warning (the
    import ignores them)."""
    tui.section("Headers · Google Sheet vs schema")

    try:
        gc = get_gspread_client()
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    except Exception as e:
        logger.error(f"Could not connect to Google Sheets: {e}")
        record_stage("Headers", "fail", "could not connect to Google Sheets")
        return False

    tables_to_check = target_tables or list(schema_def.keys())
    # Report in import order; tables the import does not know go last.
    tables_to_check.sort(key=lambda t: IMPORT_ORDER.index(t) if t in IMPORT_ORDER else len(IMPORT_ORDER))

    def check_table(table_name):
        """(worksheet, sheet columns, schema columns, missing, extra,
        duplicates, error) for one table."""
        ws_name = WORKSHEET_MAP.get(table_name)
        if not ws_name:
            return table_name, 0, 0, [], [], {}, "no worksheet mapping"
        if table_name not in schema_def:
            return ws_name, 0, 0, [], [], {}, "not in schema"
        try:
            ws = spreadsheet.worksheet(ws_name)
            sheet_headers = [h.strip() for h in ws.row_values(1) if h.strip()]
        except Exception as e:
            return ws_name, 0, 0, [], [], {}, f"could not read worksheet: {e}"

        schema_cols = {c["Column"] for c in schema_def[table_name].get("columns", [])}
        sheet_cols = set(sheet_headers)
        seen: Dict[str, int] = {}
        for h in sheet_headers:
            seen[h] = seen.get(h, 0) + 1
        duplicates = {h: cnt for h, cnt in seen.items() if cnt > 1}
        missing = sorted(schema_cols - sheet_cols)
        extra = sorted(sheet_cols - schema_cols)
        return ws_name, len(sheet_headers), len(schema_cols), missing, extra, duplicates, None

    with console.status("Reading header rows ...", spinner_style="info"):
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, max(1, len(tables_to_check)))) as executor:
            results = dict(zip(tables_to_check, executor.map(check_table, tables_to_check)))

    overview = tui.table("Table", "Worksheet", "Columns", "Missing#", "Extra#", "Duplicates#", "")
    problems: List[tuple] = []
    failed = 0
    for table in tables_to_check:
        ws_name, n_sheet, n_schema, missing, extra, duplicates, error = results[table]
        if error:
            failed += 1
            overview.add_row(table, ws_name, "-", "-", "-", "-", f"{tui.ICONS['fail']} {error}")
            continue
        ok = not missing and not duplicates
        failed += 0 if ok else 1
        overview.add_row(
            table,
            ws_name,
            f"{n_sheet} / {n_schema}",
            str(len(missing)) if missing else "[muted]0[/muted]",
            str(len(extra)) if extra else "[muted]0[/muted]",
            str(len(duplicates)) if duplicates else "[muted]0[/muted]",
            tui.ICONS["fail" if not ok else "warn" if extra else "pass"],
        )
        if missing:
            problems.append(("fail", f"{table}: missing in the sheet: {', '.join(missing)}"))
        if duplicates:
            dup = ", ".join(f"'{h}' x{cnt}" for h, cnt in duplicates.items())
            problems.append(("fail", f"{table}: duplicated headers: {dup}"))
        if extra:
            problems.append(("warn", f"{table}: extra in the sheet (not imported): {', '.join(extra)}"))
    tui.print_table(overview)
    tui.note("Columns: sheet / schema", indent=2)
    for status, message in problems:
        tui.line(status, message)

    if failed:
        record_stage("Headers", "fail", f"{tui.plural(failed, 'table')} do not match the schema")
        return False
    warned = sum(1 for status, _ in problems if status == "warn")
    record_stage(
        "Headers",
        "warn" if warned else "pass",
        f"{tui.plural(len(tables_to_check), 'sheet')} match"
        + (f", {tui.plural(warned, 'sheet')} with extra columns" if warned else ""),
    )
    return True
