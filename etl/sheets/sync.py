"""
sheets.sync
-----------
Replaces the rows of the main sheet's accounts, centers and services with
the rows of another spreadsheet laid out by a profile (etl/sources/), such
as the data team's sheet. It is the copy-and-paste step, done by the
profile's column mapping instead of by hand.

Every column of the main sheet gets one of four treatments:

  copy      a column the profile maps: their value, in our sheet's types
            (a date typed as text becomes a real date, '1,500' in a number
            column becomes 1500, their GCC becomes our include). A cell they
            typed as a formula ('=+16142836500') is copied as its value.
  formula   a formula on every row of our sheet (the ranges, lookups):
            the formula in row 2 is filled down to every row.
  constant  one value on every row of our sheet (account_source,
            center_country_iso2): that value on every row.
  blank     anything else (lat, lng, and the profile's sync.skip columns
            such as cn_unique_key): left empty, to be filled by hand.

The rows come in the source's order. Rows are not matched one by one: the
main sheet's rows are replaced as a whole, so nothing of the old rows
survives except formats and the column treatments above.

Dry run by default. --apply first copies the whole main spreadsheet into
the backup folder (BACKUP_FOLDER_ID in etl/.env, see common/drive.py) and
writes nothing if that copy fails.

Run with:
    uv run --directory etl python -m sheets.sync --source data-team
    uv run --directory etl python -m sheets.sync --source data-team --apply
"""

import argparse
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime

import gspread
import requests
from gspread.utils import rowcol_to_a1
from rich.prompt import Confirm

from common import tui
from common.drive import BackupFailed, backup_spreadsheet
from common.env import SPREADSHEET_ID, require
from common.google import (
    SCOPE_DRIVE,
    SCOPE_READWRITE,
    SheetNotSettled,
    authorize,
    get_credentials,
    read_settled,
    safe_api_call,
)
from common.tui import console
from sheets import source
from sheets.rules import ALL_RULES

FIRST_DATA_ROW = 2
WRITE_ROWS = 1000
EXCEL_EPOCH = date(1899, 12, 30)  # day 0 of a Sheets date serial
NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")


# -- Pure parts (tested in tests/test_sync.py) ---------------------------------
@dataclass
class Plan:
    """What one sheet's columns get, decided from our sheet's current rows."""

    headers: list[str]
    kinds: dict[str, str] = field(default_factory=dict)  # column -> copy, formula, constant, blank
    constants: dict[str, object] = field(default_factory=dict)
    formulas: dict[str, str] = field(default_factory=dict)  # column -> row 2 formula
    numeric: set[str] = field(default_factory=set)
    dates: set[str] = field(default_factory=set)


def is_formula(value) -> bool:
    return isinstance(value, str) and value.startswith("=")


def plan_columns(sheet: str, headers: list[str], values: list[list], formulas: list[list], skip: set[str]) -> Plan:
    """Decide each of our columns' treatment. values are our sheet's
    unformatted data rows, formulas the same rows rendered as formulas."""
    plan = Plan(headers=headers)
    rows = len(values)
    rules = ALL_RULES.get(sheet, {})
    for c, column in enumerate(headers):
        cells = [r[c] if c < len(r) else "" for r in values]
        formula_cells = [r[c] for r in formulas if c < len(r) and is_formula(r[c])]
        if column in skip or not column:
            plan.kinds[column] = "blank"
        elif rows and len(formula_cells) == rows:
            plan.kinds[column] = "formula"
            plan.formulas[column] = formulas[0][c]
        elif source.active.has_column(sheet, column):
            plan.kinds[column] = "copy"
            filled = [v for v in cells if v != ""]
            if filled and sum(isinstance(v, (int, float)) for v in filled) >= 0.99 * len(filled):
                plan.numeric.add(column)
            if "date in this exact format" in rules.get(column, {}).get("Description", "").lower():
                plan.dates.add(column)
        elif rows and all(v != "" for v in cells) and len(set(map(str, cells))) == 1:
            plan.kinds[column] = "constant"
            plan.constants[column] = cells[0]
        else:
            plan.kinds[column] = "blank"
    return plan


def to_serial(value: str) -> int | None:
    """'3-December-2024' (or '3-Dec-2024') as a Sheets date serial, else None."""
    for fmt in ("%d-%B-%Y", "%d-%b-%Y"):
        try:
            return (datetime.strptime(value.strip(), fmt).date() - EXCEL_EPOCH).days
        except ValueError:
            continue
    return None


def convert(value, column: str, plan: Plan):
    """Their value in our column's type."""
    if isinstance(value, str):
        text = value.strip()
        if column in plan.dates and text:
            serial = to_serial(text)
            if serial is not None:
                return serial
        if column in plan.numeric:
            number = text.replace(",", "")
            if NUMBER_RE.match(number):
                return float(number) if "." in number else int(number)
    return value


def build_rows(plan: Plan, src_headers: list[str], src_rows: list[list]) -> list[list]:
    """Our rows from theirs. A formula column holds None (not written)."""
    index = {h: i for i, h in enumerate(src_headers) if h}
    out = []
    for row in src_rows:
        new = []
        for column in plan.headers:
            kind = plan.kinds[column]
            if kind == "copy":
                i = index.get(column)
                value = row[i] if i is not None and i < len(row) else ""
                new.append(convert(value, column, plan))
            elif kind == "constant":
                new.append(plan.constants[column])
            elif kind == "formula":
                new.append(None)
            else:
                new.append("")
        out.append(new)
    return out


def same(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return str(a) == str(b)


def column_runs(plan: Plan) -> list[tuple[int, int]]:
    """(first, last) 0-based column runs that are written, skipping formulas."""
    runs, start = [], None
    for c, column in enumerate(plan.headers + [None]):
        written = column is not None and plan.kinds[column] != "formula"
        if written and start is None:
            start = c
        elif not written and start is not None:
            runs.append((start, c - 1))
            start = None
    return runs


# -- Reading -------------------------------------------------------------------
@dataclass
class SheetJob:
    sheet: str
    tab: str
    src_headers: list[str]
    src_rows: list[list]
    ws: gspread.Worksheet
    plan: Plan
    old_rows: list[list]
    new_rows: list[list]


def read_source(spreadsheet: gspread.Spreadsheet, sheet: str) -> tuple[str, list[str], list[list]]:
    tab = source.active.tab(sheet)
    ws = safe_api_call(lambda: spreadsheet.worksheet(tab), f"tab '{tab}'")
    data = read_settled(lambda: ws.get_all_values(value_render_option="UNFORMATTED_VALUE"), f"tab '{tab}'")
    if not data:
        raise SystemExit(f"Tab '{tab}' is empty.")
    raw = [str(h).strip().lower() for h in data[0]]
    headers = source.active.our_headers(sheet, raw)
    mapped = source.active.sheets[sheet]
    missing = [mapped.labels[c] for c in mapped.columns if c not in headers]
    if missing:
        raise SystemExit(
            f"Tab '{tab}' has no column {', '.join(repr(m) for m in missing)}. "
            f"Fix the header or etl/sources/{source.active.name}.toml, then run validate --source {source.active.name}."
        )
    rows = [r for r in data[1:] if any(str(v).strip() for v in r)]
    source.active.translate_rows(sheet, headers, rows)
    return tab, headers, rows


def read_target(spreadsheet: gspread.Spreadsheet, sheet: str) -> tuple[gspread.Worksheet, list[str], list[list], list[list]]:
    ws = safe_api_call(lambda: spreadsheet.worksheet(sheet), f"tab '{sheet}'")
    values = read_settled(lambda: ws.get_all_values(value_render_option="UNFORMATTED_VALUE"), f"tab '{sheet}'")
    formulas = safe_api_call(lambda: ws.get_all_values(value_render_option="FORMULA"), f"the formulas in '{sheet}'")
    headers = [str(h).strip().lower() for h in values[0]]
    return ws, headers, values[1:], formulas[1:]


# -- Report --------------------------------------------------------------------
def report(job: SheetJob, show: int) -> None:
    plan = job.plan
    tui.section(f"{job.sheet}  ←  {source.active.title} tab {job.tab}")
    old_ids = [str(r[0]) for r in job.old_rows]
    new_ids = [str(r[0]) for r in job.new_rows]
    added = [u for u in new_ids if u not in set(old_ids)]
    removed = [u for u in old_ids if u not in set(new_ids)]
    tui.line(
        "info",
        f"{tui.num(len(job.old_rows))} rows now, {tui.num(len(job.new_rows))} after: "
        f"{tui.plural(len(added), 'new row')}, {tui.plural(len(removed), 'row')} gone",
    )
    if added:
        tui.note(f"New: {', '.join(added[:show])}" + (" ..." if len(added) > show else ""))
    if removed:
        tui.line("warn", f"Gone (not in their sheet): {', '.join(removed[:show])}" + (" ..." if len(removed) > show else ""))

    by_kind: dict[str, list[str]] = {}
    for column in plan.headers:
        by_kind.setdefault(plan.kinds[column], []).append(column)
    kinds = tui.table("Treatment", "Columns#", "Which~")
    labels = {
        "copy": "copied from their sheet",
        "formula": "formula filled down",
        "constant": "same value on every row",
        "blank": "left blank, fill by hand",
    }
    for kind in ("copy", "formula", "constant", "blank"):
        cols = by_kind.get(kind, [])
        if not cols:
            continue
        which = ", ".join(f"{c} = {plan.constants[c]}" for c in cols) if kind == "constant" else ", ".join(cols)
        kinds.add_row(labels[kind], tui.num(len(cols)), tui.clip(which, 110))
    tui.print_table(kinds)

    # What changes, row by row, for the rows both sheets have.
    old_by_id = {str(r[0]): r for r in job.old_rows}
    changes = Counter()
    examples: list[tuple[str, str, str, str]] = []
    for new in job.new_rows:
        old = old_by_id.get(str(new[0]))
        if old is None:
            continue
        for c, column in enumerate(plan.headers):
            if plan.kinds[column] == "formula":
                continue
            before = old[c] if c < len(old) else ""
            if not same(before, new[c]):
                changes[column] += 1
                if len(examples) < show:
                    examples.append((str(new[0]), column, tui.clip(str(before), 45) or "(blank)", tui.clip(str(new[c]), 45) or "(blank)"))
    if not changes:
        tui.line("pass", "Rows both sheets have: no value changes.")
        return
    tui.line("info", f"Rows both sheets have: {tui.plural(sum(changes.values()), 'cell')} change")
    top = tui.table("Column", "Cells#")
    for column, n in changes.most_common(show):
        top.add_row(column, tui.num(n))
    tui.print_table(top)
    if examples:
        ex = tui.table("uuid", "Column", "Now~", "After~", title="Examples")
        for row in examples:
            ex.add_row(*row)
        tui.print_table(ex)


# -- Writing -------------------------------------------------------------------
def write(spreadsheet: gspread.Spreadsheet, job: SheetJob) -> None:
    ws, plan, rows = job.ws, job.plan, job.new_rows
    last_row = FIRST_DATA_ROW + len(rows) - 1
    old_last = FIRST_DATA_ROW + len(job.old_rows) - 1
    width = len(plan.headers)

    # 1. Room for every row; new rows take row 2's formats (dates, numbers).
    if ws.row_count < last_row:
        # resize() sets an exact row count, so a retry after a timeout that
        # did go through changes nothing.
        safe_api_call(lambda: ws.resize(rows=last_row), f"adding rows to '{job.sheet}'")
    requests = []
    if last_row > old_last:
        requests.append(_copy(ws.id, width, old_last + 1, last_row, 0, width, "PASTE_FORMAT"))
    # 2. Formulas filled down from row 2, as dragging them would.
    for c, column in enumerate(plan.headers):
        if plan.kinds[column] == "formula" and last_row > FIRST_DATA_ROW:
            requests.append(_copy(ws.id, width, FIRST_DATA_ROW + 1, last_row, c, c + 1, "PASTE_FORMULA"))
    if requests:
        safe_api_call(lambda: spreadsheet.batch_update({"requests": requests}), f"formats and formulas in '{job.sheet}'")

    # 3. Values, RAW so text stays text and numbers stay numbers.
    for first, last in column_runs(plan):
        for start in range(0, len(rows), WRITE_ROWS):
            chunk = [row[first : last + 1] for row in rows[start : start + WRITE_ROWS]]
            top = FIRST_DATA_ROW + start
            a1 = f"'{ws.title}'!{rowcol_to_a1(top, first + 1)}:{rowcol_to_a1(top + len(chunk) - 1, last + 1)}"
            safe_api_call(
                lambda a1=a1, chunk=chunk: spreadsheet.values_batch_update(
                    {"valueInputOption": "RAW", "data": [{"range": a1, "values": chunk}]}
                ),
                f"writing '{job.sheet}' rows {top}-{top + len(chunk) - 1}",
            )

    # 4. Fewer rows than before: the leftover rows go.
    if old_last > last_row:
        safe_api_call(
            lambda: spreadsheet.batch_update(
                {
                    "requests": [
                        {
                            "deleteDimension": {
                                "range": {"sheetId": ws.id, "dimension": "ROWS", "startIndex": last_row, "endIndex": old_last}
                            }
                        }
                    ]
                }
            ),
            f"removing leftover rows in '{job.sheet}'",
            idempotent=False,
        )


def _copy(sheet_id: int, width: int, first_row: int, last_row: int, first_col: int, end_col: int, paste: str) -> dict:
    """copyPaste row 2's cells in [first_col, end_col) to rows first_row..last_row (1-based)."""
    return {
        "copyPaste": {
            "source": {
                "sheetId": sheet_id,
                "startRowIndex": FIRST_DATA_ROW - 1,
                "endRowIndex": FIRST_DATA_ROW,
                "startColumnIndex": first_col,
                "endColumnIndex": end_col,
            },
            "destination": {
                "sheetId": sheet_id,
                "startRowIndex": first_row - 1,
                "endRowIndex": last_row,
                "startColumnIndex": first_col,
                "endColumnIndex": end_col,
            },
            "pasteType": paste,
        }
    }


# -- Main ----------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m sheets.sync",
        description="Replace the main sheet's rows with another spreadsheet's, by its profile. Dry run unless --apply.",
    )
    parser.add_argument("--source", required=True, help="Profile in etl/sources/, such as data-team.")
    parser.add_argument("--sheets", help="Only these sheets (comma-separated). Default: every sheet the profile has.")
    parser.add_argument("--apply", action="store_true", help="Back up the main sheet, then write.")
    parser.add_argument("--yes", action="store_true", help="With --apply, write without asking to confirm.")
    parser.add_argument("--limit", type=int, default=8, help="Examples shown per sheet (default 8).")
    args = parser.parse_args()
    try:
        source.select(args.source)
    except ValueError as exc:
        parser.error(f"--source: {exc}")
    if source.active.is_main:
        parser.error("--source: pick the spreadsheet to copy from, not the main sheet itself.")
    known = source.active.sheet_names
    args.sheet_list = [s.strip() for s in (args.sheets or "").split(",") if s.strip()] or known
    unknown = [s for s in args.sheet_list if s not in known]
    if unknown:
        parser.error(f"--sheets: unknown sheet(s) {', '.join(unknown)}. Known: {', '.join(known)}")
    return args


def main() -> None:
    args = parse_args()
    active = source.active
    require("SPREADSHEET_ID", active.spreadsheet_env, "GOOGLE_SA_FILE")
    backup_folder = os.getenv("BACKUP_FOLDER_ID", "")
    if args.apply and not backup_folder:
        console.print("[error][ERROR][/error] Set BACKUP_FOLDER_ID in etl/.env: --apply backs up the main sheet first.")
        sys.exit(1)

    gc = authorize(get_credentials(scopes=[SCOPE_READWRITE, SCOPE_DRIVE] if args.apply else None))
    with console.status("Connecting to Google Sheets ...", spinner_style="info"):
        their = safe_api_call(lambda: gc.open_by_key(active.spreadsheet_id), "their spreadsheet")
        ours = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID), "the main spreadsheet")
    skip = set(active.sync_skip)
    tui.header(
        "sync",
        [
            ("From", f"[bold]{their.title}[/bold] [muted](etl/sources/{active.name}.toml)[/muted]"),
            ("To", f"[bold]{ours.title}[/bold]"),
            ("Sheets", ", ".join(f"{s} ← {active.tab(s)}" for s in args.sheet_list)),
            ("Left blank", ", ".join(sorted(skip)) or "-"),
            (
                "Mode",
                "[error]apply: backs up the main sheet, then replaces its rows after you confirm[/error]"
                if args.apply
                else "dry run: nothing is written",
            ),
        ],
    )

    jobs: list[SheetJob] = []
    with tui.loading(len(args.sheet_list) * 2, "Reading") as bar:
        for sheet in args.sheet_list:
            bar.start(f"Reading their '{active.tab(sheet)}'")
            tab, src_headers, src_rows = read_source(their, sheet)
            bar.done()
            bar.start(f"Reading our '{sheet}'")
            ws, headers, old_rows, old_formulas = read_target(ours, sheet)
            bar.done()
            plan = plan_columns(sheet, headers, old_rows, old_formulas, skip)
            jobs.append(SheetJob(sheet, tab, src_headers, src_rows, ws, plan, old_rows, build_rows(plan, src_headers, src_rows)))

    for job in jobs:
        report(job, args.limit)

    tui.section("Summary")
    total = sum(len(j.new_rows) for j in jobs)
    blanks = sorted({c for j in jobs for c in j.plan.headers if j.plan.kinds[c] == "blank"})
    after = [
        f"Fill by hand afterwards: {', '.join(blanks)}." if blanks else "",
        "Do not import until then: etl/validate.sh fails while required columns are blank.",
    ]
    if not args.apply:
        tui.verdict(
            "warn",
            f"Dry run · {tui.plural(total, 'row')} would replace the rows of {tui.plural(len(jobs), 'sheet')}",
            ["[bold]--apply[/bold] backs up the main sheet, then writes (you are asked to confirm first).", *filter(None, after)],
        )
        return

    if not args.yes:
        if not sys.stdin.isatty():
            tui.verdict("warn", "Nothing written", ["No terminal to confirm on. Pass --yes to write without asking."])
            return
        console.print()
        if not Confirm.ask(
            f"  Replace the rows of [bold]{', '.join(j.sheet for j in jobs)}[/bold] in [bold]{ours.title}[/bold]?",
            console=console,
            default=False,
        ):
            tui.verdict("warn", "Nothing written", [])
            return

    with console.status("Backing up the main sheet ...", spinner_style="info"):
        try:
            url = backup_spreadsheet(SPREADSHEET_ID, ours.title, backup_folder)
        except BackupFailed as exc:
            tui.verdict("fail", "Nothing written: the backup failed", [str(exc)])
            sys.exit(1)
    tui.line("pass", f"Backup: {url}")

    with tui.loading(len(jobs), "Writing") as bar:
        for job in jobs:
            bar.start(f"Writing '{job.sheet}'")
            write(ours, job)
            bar.done()
    for job in jobs:
        tui.line("pass", f"{job.sheet}: {tui.plural(len(job.new_rows), 'row')} written")
    tui.verdict(
        "pass",
        f"Replaced the rows of {tui.plural(len(jobs), 'sheet')}",
        [f"Backup of the sheet before this run: {url}", *filter(None, after), "Then etl/validate.sh, then etl/import.sh."],
    )


def run() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped.[/warning]")
        sys.exit(130)
    except SheetNotSettled as exc:
        console.print(f"[error][ERROR][/error] {exc}")
        sys.exit(1)
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, gspread.exceptions.APIError) as exc:
        console.print()
        console.print(
            "[error][ERROR][/error] Google Sheets stopped answering after every retry "
            f"({type(exc).__name__}). The sheet is most likely still recalculating."
        )
        console.print(
            "        The backup was made before any write. Sheets already written are complete;\n"
            "        run the same command again once the sheet is responsive (it replaces the rows\n"
            "        again, so a repeat is safe), or with --sheets for only the ones left."
        )
        sys.exit(1)


if __name__ == "__main__":
    run()
