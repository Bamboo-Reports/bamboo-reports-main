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
fix_invisible_chars.py
----------------------
Strips invisible characters (zero-width spaces, zero-width joiners and
non-joiners, byte order marks, soft hyphens) from every cell in the sheets
checked by validate.py Phase 0B.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the cleaned values back.

Run with:
    uv run fix_invisible_chars.py            # preview only
    uv run fix_invisible_chars.py --apply    # write changes

Uses the same .env as validate.py (SPREADSHEET_ID, GOOGLE_SA_FILE).
"""

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
from rich.console import Console
from rich.table import Table

# Keep in sync with INVISIBLE_CHARS in validate.py.
INVISIBLE_CHARS = {
    "\u200b": "zero-width space",
    "\u200c": "zero-width non-joiner",
    "\u200d": "zero-width joiner",
    "\u2060": "word joiner",
    "\ufeff": "byte order mark",
    "\u00ad": "soft hyphen",
    # Bidirectional formatting controls. Just as invisible and just as
    # damaging as the zero-width characters above: centers!center_boardline
    # row 4286 and three prospects!prospect_title cells carry these and were
    # reported clean before they were added here.
    "\u200e": "left-to-right mark",
    "\u200f": "right-to-left mark",
    "\u202a": "left-to-right embedding",
    "\u202b": "right-to-left embedding",
    "\u202c": "pop directional formatting",
    "\u202d": "left-to-right override",
    "\u202e": "right-to-left override",
    "\u2066": "left-to-right isolate",
    "\u2067": "right-to-left isolate",
    "\u2068": "first strong isolate",
    "\u2069": "pop directional isolate",
}
INVISIBLE_CHARS_RE = re.compile("[" + "".join(INVISIBLE_CHARS) + "]")

SHEETS = ["accounts", "centers", "services", "prospects", "ticker", "alias", "functions", "tech"]

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


def col_letter(col_idx: int) -> str:
    """1-based column index to A1 letter(s)."""
    letters = ""
    while col_idx > 0:
        col_idx, rem = divmod(col_idx - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def main() -> None:
    apply_changes = "--apply" in sys.argv

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)

    console.print("[bold blue][*][/bold blue] Opening spreadsheet ...")
    spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    console.print("[bold green][OK][/bold green] Connected.\n")

    if not apply_changes:
        console.print("[bold yellow]DRY RUN[/bold yellow]: no changes will be written. Use --apply to write.\n")

    total_fixed = 0
    report = Table(show_header=True)
    report.add_column("Sheet", style="bold")
    report.add_column("Cell")
    report.add_column("Character(s)")
    report.add_column("Cleaned value (first 50 chars)")

    for sheet_name in SHEETS:
        console.print(f"  [bold blue][*][/bold blue] Scanning '{sheet_name}' ...")
        try:
            ws = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            console.print(f"  [bold yellow][WARN][/bold yellow] Worksheet '{sheet_name}' not found, skipping.")
            continue

        rows = safe_api_call(lambda: ws.get_all_values())
        time.sleep(0.5)

        dirty_cells: list[gspread.Cell] = []
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, value in enumerate(row, start=1):
                value = str(value)
                hits = INVISIBLE_CHARS_RE.findall(value)
                if not hits:
                    continue
                cleaned = INVISIBLE_CHARS_RE.sub("", value)
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                a1 = f"{col_letter(col_idx)}{row_idx}"
                report.add_row(sheet_name, a1, kinds, cleaned[:50])
                dirty_cells.append(gspread.Cell(row=row_idx, col=col_idx, value=cleaned))

        if not dirty_cells:
            console.print(f"  [bold green][OK][/bold green] '{sheet_name}' is clean.")
            continue

        total_fixed += len(dirty_cells)
        if apply_changes:
            # RAW so the cleaned text is written back verbatim, not reparsed.
            safe_api_call(lambda: ws.update_cells(dirty_cells, value_input_option="RAW"))
            time.sleep(0.5)
            console.print(f"  [bold green][OK][/bold green] Fixed {len(dirty_cells)} cell(s) in '{sheet_name}'.")
        else:
            console.print(f"  [bold yellow][->][/bold yellow] Would fix {len(dirty_cells)} cell(s) in '{sheet_name}'.")

    console.print()
    if total_fixed:
        console.print(report)
        verb = "Fixed" if apply_changes else "Would fix"
        console.print(f"\n[bold]{verb} {total_fixed} cell(s) total.[/bold]")
        if not apply_changes:
            console.print("Re-run with [bold]--apply[/bold] to write these changes.")
        else:
            console.print("Re-run validate.py to confirm Phase 0B passes.")
    else:
        console.print("[bold green][OK][/bold green] No invisible characters found. Nothing to do.")


if __name__ == "__main__":
    main()
