#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-auth",
#     "gspread",
#     "python-dotenv",
#     "rich",
# ]
# ///

"""
split_services_software.py
--------------------------
Normalises the bulleted software lists in services!AE (software_vendor)
and services!AF (software_in_use) so that every cell is one plain name
per line with no bullet markers.

    Before:  '- Microsoft Corp. - VMware LLC\\n- Linux Laboratories Pvt. Ltd.'
    After:   'Microsoft Corp.\\nVMware LLC\\nLinux Laboratories Pvt. Ltd.'

What it does to each cell:
    - treats \\r\\n and bare \\r as line breaks (some cells were pasted with \\r)
    - splits lines that hold several items separated by ' - ' or ' • '
    - removes leading '-' and '•' bullet markers
    - trims whitespace around every item and drops empty lines
    - joins the items back with a real line break

Names are never altered beyond that: 'Workday, Inc.' and 'SAP-PP' stay as
they are, because commas are kept and a hyphen is only treated as a
separator when it has a space on both sides.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the cleaned values back.

Run with:
    uv run split_services_software.py                  # preview only
    uv run split_services_software.py --apply          # write changes
    uv run split_services_software.py --columns AE     # one column only
    uv run split_services_software.py --sheet tech --columns K,M

Uses the same .env as validate.py (SPREADSHEET_ID, GOOGLE_SA_FILE).
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from gspread.utils import a1_to_rowcol, rowcol_to_a1
from rich.console import Console
from rich.table import Table

DEFAULT_SHEET = "services"
DEFAULT_COLUMNS = ["AE", "AF"]
FIRST_DATA_ROW = 2

# Bullet markers stripped from the start of an item.
LEADING_BULLET = re.compile(r"^([-•·*]+\s*)+")
# Separators that mean "another item follows on the same line". A hyphen
# only counts when surrounded by spaces so 'SAP-PP' and 'E-Business' survive.
INLINE_SEPARATOR = re.compile(r"\s+[-•]\s+")

console = Console()

# -- Configuration ------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
GOOGLE_SA_FILE = os.getenv("GOOGLE_SA_FILE")

if not SPREADSHEET_ID or not GOOGLE_SA_FILE:
    console.print("[bold red][ERROR][/bold red] SPREADSHEET_ID or GOOGLE_SA_FILE missing in .env")
    sys.exit(1)

SA_PATH = SCRIPT_DIR / GOOGLE_SA_FILE
if not SA_PATH.exists():
    console.print(f"[bold red][ERROR][/bold red] Service-account file not found: {SA_PATH}")
    sys.exit(1)

# Write scope: this script edits the spreadsheet (validate.py is read-only).
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def safe_api_call(func):
    """Retry wrapper for Google Sheets API rate limits."""
    retries = 3
    while retries > 0:
        try:
            return func()
        except gspread.exceptions.APIError as e:
            if "429" in str(e) and retries > 1:
                console.print("  [dim]...API rate limit reached, cooling down for 10s...[/dim]")
                time.sleep(10)
                retries -= 1
            else:
                raise


def normalise(value: str) -> str:
    """One item per line, no bullet markers, no stray whitespace."""
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        for piece in INLINE_SEPARATOR.split(line):
            piece = LEADING_BULLET.sub("", piece.strip()).strip()
            if piece:
                items.append(piece)
    return "\n".join(items)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Strip bullet markers and put every software item on its own line. "
            "Runs as a dry run unless --apply is given."
        )
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the spreadsheet.")
    parser.add_argument("--sheet", default=DEFAULT_SHEET, help=f"Worksheet name (default: {DEFAULT_SHEET}).")
    parser.add_argument(
        "--columns",
        default=",".join(DEFAULT_COLUMNS),
        help=f"Comma-separated column letters (default: {','.join(DEFAULT_COLUMNS)}).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    columns = [c.strip().upper() for c in args.columns.split(",") if c.strip()]
    if not columns:
        console.print("[bold red][ERROR][/bold red] --columns must list at least one column letter.")
        sys.exit(1)
    col_numbers = {a1_to_rowcol(f"{c}1")[1]: c for c in columns}
    first_col, last_col = min(col_numbers), max(col_numbers)

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)

    console.print("[bold blue][*][/bold blue] Opening spreadsheet ...")
    spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    try:
        ws = spreadsheet.worksheet(args.sheet)
    except gspread.exceptions.WorksheetNotFound:
        console.print(f"[bold red][ERROR][/bold red] Worksheet '{args.sheet}' not found.")
        sys.exit(1)
    console.print("[bold green][OK][/bold green] Connected.\n")

    if not args.apply:
        console.print("[bold yellow]DRY RUN[/bold yellow]: no changes will be written. Use --apply to write.\n")

    headers = safe_api_call(lambda: ws.row_values(1))
    console.print(f"  Sheet '{args.sheet}', columns:")
    for n in sorted(col_numbers):
        name = headers[n - 1] if n <= len(headers) else "(no header)"
        console.print(f"    {col_numbers[n]}: {name}")
    console.print()

    rng = f"{col_numbers[first_col]}{FIRST_DATA_ROW}:{col_numbers[last_col]}"
    values = safe_api_call(lambda: ws.get(rng))
    time.sleep(0.5)

    report = Table(show_header=True)
    report.add_column("Cell", style="bold")
    report.add_column("Before (repr, first 60)")
    report.add_column("After (first 60)")

    dirty_cells: list[gspread.Cell] = []
    per_column: dict[str, int] = {c: 0 for c in columns}
    for row_offset, row in enumerate(values):
        sheet_row = FIRST_DATA_ROW + row_offset
        for col_offset, value in enumerate(row):
            col_number = first_col + col_offset
            if col_number not in col_numbers or not isinstance(value, str) or not value.strip():
                continue
            cleaned = normalise(value)
            if cleaned == value:
                continue
            per_column[col_numbers[col_number]] += 1
            report.add_row(rowcol_to_a1(sheet_row, col_number), repr(value)[:60], cleaned[:60])
            dirty_cells.append(gspread.Cell(row=sheet_row, col=col_number, value=cleaned))

    if not dirty_cells:
        console.print("[bold green][OK][/bold green] Every cell is already one item per line. Nothing to do.")
        return

    console.print(report)
    console.print()
    for c, n in per_column.items():
        console.print(f"  {c}: {n} cell(s)")

    if args.apply:
        # RAW so the text is written back verbatim (a leading '-' or '=' would
        # otherwise be reparsed by Sheets).
        for i in range(0, len(dirty_cells), 2000):
            batch = dirty_cells[i : i + 2000]
            safe_api_call(lambda: ws.update_cells(batch, value_input_option="RAW"))
            time.sleep(0.5)
        console.print(f"\n[bold]Fixed {len(dirty_cells)} cell(s) total.[/bold]")
    else:
        console.print(f"\n[bold]Would fix {len(dirty_cells)} cell(s) total.[/bold]")
        console.print("Re-run with [bold]--apply[/bold] to write these changes.")


if __name__ == "__main__":
    main()
