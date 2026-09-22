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
normalise_list_text.py
----------------------
Cleans free-text list columns so every cell is one item per line, with no
bullet prefix and consistent casing. Default columns per sheet:

    services: primary_service, focus_region, service_it, service_ai,
              service_erd, service_fna, service_hr, service_procurement,
              service_sales_marketing, service_customer_support, service_others
    accounts: account_hq_key_offerings

    Before:  '- North America\\nGlobal\\nindia'      After:  'North America\\nGlobal\\nIndia'
    Before:  'APAC\\nIndia Global'                  After:  'APAC\\nIndia\\nGlobal'
    Before:  'Procure-to-Pay - Global Sourcing'    After:  'Procure-to-Pay\\nGlobal Sourcing'
    Before:  'AI/ML engineering'                   After:  'AI/ML Engineering'

What it does to each cell:
    - treats \\r\\n and bare \\r as line breaks
    - removes leading '-', '•', '*' bullet markers (with or without a space)
    - splits items joined by ' • ' onto separate lines
    - services only: also splits items joined by ' - '. A hyphen only counts
      when it has a space on both sides, so 'Procure-to-Pay' and
      'Cloud-native' are kept whole. In accounts a ' - ' joins a product to
      its description ('AgentOS - AI Agents Platform'), so it is kept.
    - trims whitespace, drops empty lines and a trailing comma
    - drops exact duplicate lines within the same cell
    - focus_region only: splits a line made of two or more known regions
      run together ('India Global', 'Global India') using the region names
      already used in the sheet
    - casing: every word that is entirely lowercase gets a capital first
      letter ('india' -> 'India', 'engineering' -> 'Engineering'). Words
      that already contain a capital are left alone, so APAC, AI/ML, UI/UX,
      R&D and iOS survive. Small joining words (and, of, for, to, ...) stay
      lowercase unless they start the item.

Commas are not treated as separators: some cells hold sentences.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the cleaned values back.

Run with:
    uv run normalise_list_text.py                         # services, preview
    uv run normalise_list_text.py --apply                 # services, write
    uv run normalise_list_text.py --sheet accounts        # key offerings, preview
    uv run normalise_list_text.py --columns focus_region,primary_service

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

DEFAULT_SHEET = "services"
DEFAULT_COLUMNS = {
    "services": [
        "primary_service",
        "focus_region",
        "service_it",
        "service_ai",
        "service_erd",
        "service_fna",
        "service_hr",
        "service_procurement",
        "service_sales_marketing",
        "service_customer_support",
        "service_others",
    ],
    "accounts": ["account_hq_key_offerings"],
}
# Sheets where ' - ' joins two separate items rather than a name and its
# description.
SPLIT_ON_HYPHEN = {"services"}
FIRST_DATA_ROW = 2

LEADING_BULLET = re.compile(r"^([-•·*]+\s*)+")
INLINE_SEPARATOR_FULL = re.compile(r"\s+[-•]\s+")
INLINE_SEPARATOR_BULLET_ONLY = re.compile(r"\s+•\s+")
LOWERCASE_WORD = re.compile(r"^[^A-Za-z]*[a-z][^A-Z]*$")
SMALL_WORDS = {
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of",
    "on", "or", "per", "the", "to", "via", "vs", "with",
}

# Region names that appear in focus_region. Used only to split lines where
# two regions were typed on one line without a separator. Multi-word names
# are listed so 'North America' is not split into 'North' and 'America'.
KNOWN_REGIONS = [
    "Global", "India", "APAC", "EMEA", "North America", "SEA", "Europe", "MEA",
    "ANZ", "SAARC", "United States", "ASEAN", "LATM", "LATAM", "South Asia",
    "Africa", "Japan", "US", "USA", "Canada", "Asia", "Australia", "APJ",
    "Middle East", "United Kingdom", "Singapore", "America", "UK", "China",
    "Indian Subcontinent", "MENA", "Malaysia", "Sri Lanka", "Srilanka",
    "Bangladesh", "South Africa", "Germany", "UAE", "Latin America", "Nepal",
    "AMEA", "Bhutan", "Oceania", "South America", "France", "Spain", "ME",
    "South Korea", "Mexico", "IMEA", "Ireland", "West Asia", "Philippines",
    "Turkey", "Thailand", "New Zealand", "Indonesia", "Vietnam", "Netherlands",
    "Italy", "Brazil", "Sweden", "Switzerland", "Poland", "Israel", "Korea",
    "Hong Kong", "Taiwan", "Pakistan", "Egypt", "Saudi Arabia", "Nordics",
    "Benelux", "DACH", "Americas", "Asia Pacific", "Rest of World", "ROW",
]
_REGION_LOOKUP = {r.lower(): r for r in KNOWN_REGIONS}
_MAX_REGION_WORDS = max(len(r.split()) for r in KNOWN_REGIONS)

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


def fix_case(item: str) -> str:
    """Capitalise all-lowercase words; leave words with any capital alone."""
    words = item.split(" ")
    out = []
    for i, w in enumerate(words):
        if LOWERCASE_WORD.match(w) and not (i > 0 and w.lower() in SMALL_WORDS):
            m = re.search(r"[a-z]", w)
            w = w[: m.start()] + w[m.start()].upper() + w[m.start() + 1 :]
        out.append(w)
    return " ".join(out)


def split_regions(line: str) -> list[str]:
    """Split 'India Global' into ['India', 'Global'] if every word is a
    known region name. Returns [line] unchanged otherwise."""
    words = line.split()
    if len(words) < 2:
        return [line]
    parts: list[str] = []
    i = 0
    while i < len(words):
        matched = False
        for n in range(min(_MAX_REGION_WORDS, len(words) - i), 0, -1):
            cand = " ".join(words[i : i + n])
            if cand.lower() in _REGION_LOOKUP:
                parts.append(_REGION_LOOKUP[cand.lower()])
                i += n
                matched = True
                break
        if not matched:
            return [line]
    return parts if len(parts) > 1 else [line]


def normalise(value: str, column: str, sheet: str = DEFAULT_SHEET) -> str:
    separator = INLINE_SEPARATOR_FULL if sheet in SPLIT_ON_HYPHEN else INLINE_SEPARATOR_BULLET_ONLY
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        for piece in separator.split(line):
            piece = LEADING_BULLET.sub("", piece.strip()).strip()
            piece = re.sub(r"\s*,\s*$", "", piece)
            piece = re.sub(r"\s{2,}", " ", piece)
            if not piece:
                continue
            pieces = split_regions(piece) if column == "focus_region" else [piece]
            for p in pieces:
                p = fix_case(p)
                if p not in items:
                    items.append(p)
    return "\n".join(items)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "One item per line, no bullets, proper case in the services text "
            "columns. Runs as a dry run unless --apply is given."
        )
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the spreadsheet.")
    parser.add_argument(
        "--sheet",
        default=DEFAULT_SHEET,
        help=f"Worksheet to clean (default: {DEFAULT_SHEET}; known: {', '.join(DEFAULT_COLUMNS)}).",
    )
    parser.add_argument(
        "--columns",
        default=None,
        help="Comma-separated column header names to clean (default: the sheet's list columns).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.columns:
        wanted = [c.strip() for c in args.columns.split(",") if c.strip()]
    elif args.sheet in DEFAULT_COLUMNS:
        wanted = DEFAULT_COLUMNS[args.sheet]
    else:
        console.print(f"[bold red][ERROR][/bold red] No default columns for '{args.sheet}'. Pass --columns.")
        sys.exit(1)

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
    console.print(f"  Sheet '{args.sheet}', columns: {', '.join(wanted)}\n")

    rows = safe_api_call(lambda: ws.get_all_values())
    headers = [h.strip() for h in rows[0]]
    col_numbers = {}
    for name in wanted:
        if name not in headers:
            console.print(f"  [bold yellow][WARN][/bold yellow] Column '{name}' not found, skipping.")
            continue
        col_numbers[name] = headers.index(name) + 1

    report = Table(show_header=True)
    report.add_column("Cell", style="bold")
    report.add_column("Column")
    report.add_column("Before (repr, first 50)")
    report.add_column("After (first 50)")

    dirty_cells: list[gspread.Cell] = []
    per_column = {c: 0 for c in col_numbers}
    for row_offset, row in enumerate(rows[FIRST_DATA_ROW - 1 :]):
        sheet_row = FIRST_DATA_ROW + row_offset
        for name, col in col_numbers.items():
            value = row[col - 1] if col - 1 < len(row) else ""
            if not value.strip():
                continue
            cleaned = normalise(value, name, args.sheet)
            if cleaned == value:
                continue
            per_column[name] += 1
            report.add_row(rowcol_to_a1(sheet_row, col), name, repr(value)[:50], cleaned[:50])
            dirty_cells.append(gspread.Cell(row=sheet_row, col=col, value=cleaned))

    if not dirty_cells:
        console.print("[bold green][OK][/bold green] Every cell is already clean. Nothing to do.")
        return

    console.print(report)
    console.print()
    for name, n in per_column.items():
        console.print(f"  {name}: {n} cell(s)")

    if args.apply:
        # RAW so the text is written back verbatim, not reparsed by Sheets.
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
