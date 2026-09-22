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
normalise_links.py
------------------
Puts every URL on its own line in the link columns of accounts, centers,
services and prospects.

    Before:  'linkedin.com/in/a https://x.com/b'     After:  'linkedin.com/in/a\\nhttps://x.com/b'
    Before:  '- https://x.com/a'                     After:  'https://x.com/a'
    Before:  'https://a.com\\rhttps://b.com'          After:  'https://a.com\\nhttps://b.com'

What it does to each cell:
    - treats \\r\\n and bare \\r as line breaks
    - removes leading '-', '•', '*' bullet markers
    - splits a line that holds several URLs separated by spaces or ' | ',
      but only when every part on that line looks like a URL. A line with plain text
      in it ('32AANFB3386M1Z3 Gst No.') is left alone and reported.
    - strips wrapping quotes and a stray leading '.' from a URL
    - trims whitespace, drops empty lines and exact duplicate lines

Anything that still is not a URL after cleaning is listed at the end for
manual review. It is never changed. Pass --highlight to colour the whole
row light yellow and the offending cell light red, so the rows can be
filtered by colour and the cell spotted at a glance. --clear-highlight
resets the background of the entire data range (row 2 down, every column)
on each sheet to white.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the cleaned values back.

Run with:
    uv run normalise_links.py                    # preview only
    uv run normalise_links.py --apply            # write changes
    uv run normalise_links.py --sheets centers   # one sheet only
    uv run normalise_links.py --highlight        # colour cells needing a manual look
    uv run normalise_links.py --clear-highlight  # remove that colour again

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
from gspread.utils import rowcol_to_a1
from rich.console import Console
from rich.table import Table

# Every column that holds one or more URLs. Columns named *_source_type,
# account_source and center_employees_linkedin hold text or numbers and are
# deliberately absent.
LINK_COLUMNS = {
    "accounts": [
        "account_hq_website",
        "account_hq_linkedin_link",
        "account_key_offerings_source_link",
        "account_hq_revenue_source_link",
        "account_hq_employee_source_link",
    ],
    "centers": [
        "center_inc_year_updated_link",
        "center_account_website",
        "center_source_link",
        "center_website",
        "center_linkedin",
        "center_employees_article_source_link",
        "center_employees_range_linkedin_source_link",
    ],
    "services": [
        "primary_service_link",
        "focus_region_link",
        "service_it_link",
        "service_ai_link",
        "service_erd_link",
        "service_fna_link",
        "service_hr_link",
        "service_procurement_link",
        "service_sales_marketing_link",
        "service_customer_support_link",
        "service_others_link",
        "software_source_link",
    ],
    "prospects": [
        "prospect_linkedin_url",
        "prospect_other_source_url",
    ],
}
FIRST_DATA_ROW = 2

LEADING_BULLET = re.compile(r"^([-•·*]+\s*)+")
# Same shape as URL_LINE_PATTERN in validate.py: optional scheme or www.,
# a dotted host, optional path, no whitespace.
URL_LINE = re.compile(r"^(https?://|www\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?(/\S*)?$")
# Backgrounds used by --highlight (row light yellow, cell light red) and
# --clear-highlight (white).
ROW_HIGHLIGHT = {"red": 1.0, "green": 0.95, "blue": 0.7}
CELL_HIGHLIGHT = {"red": 1.0, "green": 0.75, "blue": 0.75}
WHITE = {"red": 1.0, "green": 1.0, "blue": 1.0}
JUNK_TOKEN = re.compile(r"^[|.,;:\-`'\"]+$")

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


def tidy_url(token: str) -> str:
    """Strip junk that wraps a URL: quotes, a leading '.', trailing comma."""
    token = token.strip().strip('"\'')
    token = re.sub(r"^\.+(?=[A-Za-z])", "", token)
    token = re.sub(r"[,;]+$", "", token)
    return token


def normalise(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        if not line:
            continue
        tokens = [tidy_url(t) for t in line.split()]
        # Drop separators and stray punctuation between URLs: '|', '.', '-', '`'.
        tokens = [t for t in tokens if t and not JUNK_TOKEN.match(t)]
        if tokens and all(URL_LINE.match(t) for t in tokens):
            pieces = tokens
        else:
            pieces = [tidy_url(line)]
        for p in pieces:
            if p and p not in items:
                items.append(p)
    return "\n".join(items)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "One URL per line in every link column. "
            "Runs as a dry run unless --apply is given."
        )
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the spreadsheet.")
    parser.add_argument(
        "--highlight",
        action="store_true",
        help="Colour every row with a non-URL line light yellow and the cell itself light red.",
    )
    parser.add_argument(
        "--clear-highlight",
        action="store_true",
        help="Reset the background of the whole data range to white (undo --highlight).",
    )
    parser.add_argument(
        "--sheets",
        default=",".join(LINK_COLUMNS),
        help=f"Comma-separated sheets to clean (default: {','.join(LINK_COLUMNS)}).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sheets = [s.strip() for s in args.sheets.split(",") if s.strip()]
    unknown = [s for s in sheets if s not in LINK_COLUMNS]
    if unknown:
        console.print(f"[bold red][ERROR][/bold red] No link columns known for: {', '.join(unknown)}")
        sys.exit(1)

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)

    console.print("[bold blue][*][/bold blue] Opening spreadsheet ...")
    spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    console.print("[bold green][OK][/bold green] Connected.\n")

    if not args.apply:
        console.print("[bold yellow]DRY RUN[/bold yellow]: no changes will be written. Use --apply to write.\n")

    report = Table(show_header=True)
    report.add_column("Sheet", style="bold")
    report.add_column("Cell")
    report.add_column("Column")
    report.add_column("Before (repr, first 45)")
    report.add_column("After (first 45)")

    leftovers = Table(show_header=True, title="Still not a URL after cleaning (not changed)")
    leftovers.add_column("Sheet", style="bold")
    leftovers.add_column("Cell")
    leftovers.add_column("Column")
    leftovers.add_column("Line")

    total = 0
    per_column: dict[str, int] = {}
    leftover_count = 0
    highlighted = 0

    for sheet_name in sheets:
        console.print(f"  [bold blue][*][/bold blue] Scanning '{sheet_name}' ...")
        try:
            ws = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            console.print(f"  [bold yellow][WARN][/bold yellow] Worksheet '{sheet_name}' not found, skipping.")
            continue

        rows = safe_api_call(lambda: ws.get_all_values())
        time.sleep(0.5)
        headers = [h.strip() for h in rows[0]]
        col_numbers = {}
        for name in LINK_COLUMNS[sheet_name]:
            if name in headers:
                col_numbers[name] = headers.index(name) + 1
            else:
                console.print(f"  [bold yellow][WARN][/bold yellow] Column '{name}' not in '{sheet_name}', skipping.")

        last_col = len(headers)
        if args.clear_highlight:
            data_range = f"A{FIRST_DATA_ROW}:{rowcol_to_a1(len(rows), last_col)}"
            safe_api_call(lambda: ws.format(data_range, {"backgroundColor": WHITE}))
            time.sleep(0.5)
            console.print(f"  [bold green][OK][/bold green] Cleared background on {data_range} in '{sheet_name}'.")

        dirty_cells: list[gspread.Cell] = []
        flagged: list[str] = []
        for row_offset, row in enumerate(rows[FIRST_DATA_ROW - 1 :]):
            sheet_row = FIRST_DATA_ROW + row_offset
            for name, col in col_numbers.items():
                value = row[col - 1] if col - 1 < len(row) else ""
                if not value.strip() or value.strip() == "#N/A":
                    continue
                cleaned = normalise(value)
                a1 = rowcol_to_a1(sheet_row, col)
                for line in cleaned.split("\n"):
                    if not URL_LINE.match(line):
                        leftover_count += 1
                        if a1 not in flagged:
                            flagged.append(a1)
                        if leftover_count <= 200:
                            leftovers.add_row(sheet_name, a1, name, line[:70])
                if cleaned == value:
                    continue
                key = f"{sheet_name}.{name}"
                per_column[key] = per_column.get(key, 0) + 1
                report.add_row(sheet_name, rowcol_to_a1(sheet_row, col), name, repr(value)[:45], cleaned[:45])
                dirty_cells.append(gspread.Cell(row=sheet_row, col=col, value=cleaned))

        if args.highlight and flagged:
            flagged_rows = sorted({int(re.sub(r"[A-Z]+", "", a1)) for a1 in flagged})
            # Rows first, then cells, so the cell colour wins over the row colour.
            requests = [
                {"range": f"A{r}:{rowcol_to_a1(r, last_col)}", "format": {"backgroundColor": ROW_HIGHLIGHT}}
                for r in flagged_rows
            ] + [
                {"range": a1, "format": {"backgroundColor": CELL_HIGHLIGHT}} for a1 in flagged
            ]
            safe_api_call(lambda: ws.batch_format(requests))
            time.sleep(0.5)
            highlighted += len(flagged)
            console.print(
                f"  [bold yellow][!][/bold yellow] Highlighted {len(flagged)} cell(s) "
                f"across {len(flagged_rows)} row(s) in '{sheet_name}' for manual review."
            )

        if not dirty_cells:
            console.print(f"  [bold green][OK][/bold green] '{sheet_name}' link columns are clean.")
            continue

        total += len(dirty_cells)
        if args.apply:
            # RAW so the text is written back verbatim, not reparsed by Sheets.
            for i in range(0, len(dirty_cells), 2000):
                batch = dirty_cells[i : i + 2000]
                safe_api_call(lambda: ws.update_cells(batch, value_input_option="RAW"))
                time.sleep(0.5)
            console.print(f"  [bold green][OK][/bold green] Fixed {len(dirty_cells)} cell(s) in '{sheet_name}'.")
        else:
            console.print(f"  [bold yellow][->][/bold yellow] Would fix {len(dirty_cells)} cell(s) in '{sheet_name}'.")

    console.print()
    if total:
        console.print(report)
        console.print()
        for key, n in per_column.items():
            console.print(f"  {key}: {n} cell(s)")
        verb = "Fixed" if args.apply else "Would fix"
        console.print(f"\n[bold]{verb} {total} cell(s) total.[/bold]")
        if not args.apply:
            console.print("Re-run with [bold]--apply[/bold] to write these changes.")
    else:
        console.print("[bold green][OK][/bold green] Every link column is already one URL per line.")

    if leftover_count:
        console.print()
        console.print(leftovers)
        if leftover_count > 200:
            console.print(f"  [dim]... and {leftover_count - 200} more.[/dim]")
        console.print(f"\n[bold yellow]{leftover_count} line(s) are not URLs and need a manual look.[/bold yellow]")
        if highlighted:
            console.print(f"[bold]{highlighted} cell(s) highlighted in the sheet.[/bold] Use --clear-highlight to reset.")
        elif not args.highlight:
            console.print("Re-run with [bold]--highlight[/bold] to colour those cells in the sheet.")


if __name__ == "__main__":
    main()
