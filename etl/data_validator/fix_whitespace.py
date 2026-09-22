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
fix_whitespace.py
-----------------
Finds (and optionally fixes) whitespace problems in every cell of the
accounts, centers, services and prospects sheets.

What counts as a problem:
    - leading or trailing whitespace on the cell ("Acme " / " Acme")
    - trailing whitespace at the end of any line inside a multi-line cell
    - two or more consecutive spaces inside the text ("Acme  Corp")
    - tab characters
    - non-breaking spaces (U+00A0) and other exotic Unicode spaces, which
      look like a normal space but do not compare equal to one
    - cells that contain nothing but whitespace
    - carriage returns (\r) used as line separators, rewritten as real line breaks

Line breaks inside a cell are kept. Only the whitespace around them is
cleaned, so multi-line descriptions and addresses stay multi-line.

These matter because keys (account_global_legal_name, cn_unique_key,
ps_unique_key) are compared exactly downstream: "Acme Corp" and "Acme  Corp"
are two different accounts to the ETL and to validate.py.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the cleaned values back.

Run with:
    uv run fix_whitespace.py                       # preview only
    uv run fix_whitespace.py --apply               # write changes
    uv run fix_whitespace.py --sheets accounts,tech  # override sheet list

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

DEFAULT_SHEETS = ["accounts", "centers", "services", "prospects"]

# Unicode spaces that render like a normal space but are a different code
# point. All of them get normalised to a plain ASCII space.
EXOTIC_SPACES = {
    " ": "non-breaking space",
    " ": "ogham space mark",
    " ": "en quad",
    " ": "em quad",
    " ": "en space",
    " ": "em space",
    " ": "three-per-em space",
    " ": "four-per-em space",
    " ": "six-per-em space",
    " ": "figure space",
    " ": "punctuation space",
    " ": "thin space",
    " ": "hair space",
    " ": "narrow no-break space",
    " ": "medium mathematical space",
    "　": "ideographic space",
}
EXOTIC_SPACES_RE = re.compile("[" + "".join(EXOTIC_SPACES) + "]")

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


def diagnose(value: str) -> list[str]:
    """Return a list of human-readable whitespace problems found in value."""
    problems: list[str] = []
    if value and not value.strip():
        problems.append("whitespace only")
        return problems
    if "\r" in value:
        problems.append("carriage return")
    if value != value.strip():
        if value[:1].isspace():
            problems.append("leading whitespace")
        if value[-1:].isspace():
            problems.append("trailing whitespace")
    lines = value.split("\n")
    if len(lines) > 1 and any(ln != ln.rstrip(" \t\r") for ln in lines[:-1]):
        problems.append("trailing whitespace on a line")
    if "\t" in value:
        problems.append("tab")
    if re.search(r" {2,}", value):
        problems.append("double space")
    exotic = {EXOTIC_SPACES[c] for c in EXOTIC_SPACES_RE.findall(value)}
    problems.extend(sorted(exotic))
    return problems


def clean(value: str) -> str:
    """Normalise whitespace while keeping intentional line breaks."""
    value = EXOTIC_SPACES_RE.sub(" ", value)
    # Some cells were pasted with bare \r as the line separator (services
    # link columns). Treat it as a line break rather than deleting it, which
    # would glue two lines together.
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\t", " ")
    lines = [re.sub(r" {2,}", " ", ln).strip() for ln in value.split("\n")]
    # Drop blank lines at the top and bottom but keep blank lines inside
    # (they are paragraph breaks in hand-written descriptions).
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def parse_sheets(argv: list[str]) -> list[str]:
    for i, arg in enumerate(argv):
        if arg == "--sheets" and i + 1 < len(argv):
            return [s.strip() for s in argv[i + 1].split(",") if s.strip()]
        if arg.startswith("--sheets="):
            return [s.strip() for s in arg.split("=", 1)[1].split(",") if s.strip()]
    return DEFAULT_SHEETS


def main() -> None:
    apply_changes = "--apply" in sys.argv
    sheets = parse_sheets(sys.argv)

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)

    console.print("[bold blue][*][/bold blue] Opening spreadsheet ...")
    spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    console.print("[bold green][OK][/bold green] Connected.\n")

    if not apply_changes:
        console.print("[bold yellow]DRY RUN[/bold yellow]: no changes will be written. Use --apply to write.\n")

    total_fixed = 0
    per_sheet: dict[str, int] = {}
    report = Table(show_header=True)
    report.add_column("Sheet", style="bold")
    report.add_column("Cell")
    report.add_column("Column")
    report.add_column("Problem(s)")
    report.add_column("Before (repr, first 40)")
    report.add_column("After (first 40)")

    for sheet_name in sheets:
        console.print(f"  [bold blue][*][/bold blue] Scanning '{sheet_name}' ...")
        try:
            ws = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            console.print(f"  [bold yellow][WARN][/bold yellow] Worksheet '{sheet_name}' not found, skipping.")
            continue

        rows = safe_api_call(lambda: ws.get_all_values())
        time.sleep(0.5)
        headers = [str(h).strip() for h in rows[0]] if rows else []

        dirty_cells: list[gspread.Cell] = []
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, value in enumerate(row, start=1):
                value = str(value)
                if not value:
                    continue
                problems = diagnose(value)
                if not problems:
                    continue
                cleaned = clean(value)
                if cleaned == value:
                    continue
                a1 = f"{col_letter(col_idx)}{row_idx}"
                header = headers[col_idx - 1] if col_idx - 1 < len(headers) else ""
                report.add_row(
                    sheet_name,
                    a1,
                    header,
                    ", ".join(problems),
                    repr(value)[:40],
                    cleaned[:40],
                )
                dirty_cells.append(gspread.Cell(row=row_idx, col=col_idx, value=cleaned))

        if not dirty_cells:
            console.print(f"  [bold green][OK][/bold green] '{sheet_name}' is clean.")
            continue

        per_sheet[sheet_name] = len(dirty_cells)
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
        console.print()
        for name, count in per_sheet.items():
            console.print(f"  {name}: {count} cell(s)")
        verb = "Fixed" if apply_changes else "Would fix"
        console.print(f"\n[bold]{verb} {total_fixed} cell(s) total.[/bold]")
        if not apply_changes:
            console.print("Re-run with [bold]--apply[/bold] to write these changes.")
        else:
            console.print(
                "Re-run validate.py afterwards. Key columns (account_global_legal_name, "
                "cn_unique_key, ps_unique_key) may have changed spelling across sheets."
            )
    else:
        console.print("[bold green][OK][/bold green] No whitespace problems found. Nothing to do.")


if __name__ == "__main__":
    main()
