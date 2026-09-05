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
fix_case_mismatches.py
----------------------
Fixes the "Case mismatches" warnings reported by validate.py Phase 2.

For every referential-integrity rule (same list as VALIDATION_RULES in
validate.py), values in the target sheets that match the source-of-truth
sheet case-insensitively but not exactly are rewritten with the exact
spelling used in the source sheet. Example: 'Cloudangles Inc.' in 'tech'
becomes 'CloudAngles Inc.' because that is how 'accounts' spells it.

Values that do not exist in the source sheet at all (real mismatches) are
left untouched. Those are data errors, not casing issues.

cn_unique_key is built as account name + center name + type + focus + city
+ sequence number, so a wrongly cased account name is baked into the key.
A second pass checks every 'centers' row: if the key starts with the row's
account_global_legal_name only case-insensitively, the key is rebuilt with
the current name as the prefix, and the old key is renamed to the new key
wherever it appears (centers, services, functions, tech), so every sheet
keeps pointing at the same center.

Dry-run by default: prints every cell it would change without touching the
spreadsheet. Pass --apply to actually write the corrected values back.

Run with:
    uv run fix_case_mismatches.py            # preview only
    uv run fix_case_mismatches.py --apply    # write changes

Uses the same .env as validate.py (SPREADSHEET_ID, GOOGLE_SA_FILE).
"""

import os
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

# Keep in sync with VALIDATION_RULES in validate.py.
VALIDATION_RULES = [
    {
        "source_sheet": "accounts",
        "column": "account_global_legal_name",
        "target_sheets": ["centers", "services", "prospects", "tech", "alias", "ticker"],
    },
    {
        "source_sheet": "centers",
        "column": "center_name",
        "target_sheets": ["services"],
    },
    {
        "source_sheet": "centers",
        "column": "cn_unique_key",
        "target_sheets": ["services", "functions", "tech"],
    },
]

# Sheets that carry cn_unique_key. When a key is renamed in 'centers', the
# same rename is applied to every one of these.
KEY_SHEETS = ["centers", "services", "functions", "tech"]

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


class SheetCache:
    """Reads each worksheet once and keeps the handle for later writes."""

    def __init__(self, spreadsheet: gspread.Spreadsheet):
        self.spreadsheet = spreadsheet
        self._cache: dict[str, tuple[gspread.Worksheet, list[str], list[list[str]]]] = {}

    def get(self, sheet_name: str) -> tuple[gspread.Worksheet, list[str], list[list[str]]]:
        if sheet_name not in self._cache:
            ws = self.spreadsheet.worksheet(sheet_name)
            all_data = safe_api_call(lambda: ws.get_all_values())
            time.sleep(0.5)
            headers = [str(h).strip().lower() for h in all_data[0]] if all_data else []
            rows = all_data[1:] if all_data else []
            self._cache[sheet_name] = (ws, headers, rows)
        return self._cache[sheet_name]

    def column_index(self, sheet_name: str, column: str) -> int:
        """0-based column index, or -1 if the column is missing."""
        _, headers, _ = self.get(sheet_name)
        key = column.strip().lower()
        return headers.index(key) if key in headers else -1


def build_canonical_map(cache: SheetCache, source_sheet: str, column: str) -> dict[str, str]:
    """
    Map lower-cased value -> exact spelling in the source sheet.
    First occurrence wins, matching validate.py. Warns if the source sheet
    itself spells the same value in more than one way.
    """
    _, _, rows = cache.get(source_sheet)
    col_idx = cache.column_index(source_sheet, column)
    if col_idx < 0:
        console.print(
            f"  [bold red][ERROR][/bold red] Column '{column}' not found in '{source_sheet}'."
        )
        sys.exit(1)

    canonical: dict[str, str] = {}
    conflicts: dict[str, set[str]] = {}
    for row in rows:
        if col_idx >= len(row):
            continue
        val = str(row[col_idx]).strip()
        if not val:
            continue
        lower = val.lower()
        canonical.setdefault(lower, val)
        if canonical[lower] != val:
            conflicts.setdefault(lower, {canonical[lower]}).add(val)

    if conflicts:
        console.print(
            f"  [bold yellow][WARN][/bold yellow] '{source_sheet}' spells {len(conflicts)} value(s) "
            f"inconsistently. The first spelling wins; fix the source sheet by hand if that is wrong:"
        )
        for lower, spellings in sorted(conflicts.items()):
            console.print(f"      {' / '.join(sorted(spellings))}  ->  keeps '{canonical[lower]}'")

    return canonical


def plan_key_renames(cache: SheetCache) -> dict[str, str]:
    """
    Scan every 'centers' row. If cn_unique_key starts with the row's
    account_global_legal_name only case-insensitively, the key still carries
    an old spelling: rebuild it with the current name as the prefix.
    Returns {old_key: new_key}.
    """
    _, _, rows = cache.get("centers")
    key_idx = cache.column_index("centers", "cn_unique_key")
    name_idx = cache.column_index("centers", "account_global_legal_name")
    if key_idx < 0 or name_idx < 0:
        console.print(
            "  [bold yellow][WARN][/bold yellow] 'centers' lacks cn_unique_key or "
            "account_global_legal_name, skipping."
        )
        return {}

    existing_keys = {
        str(r[key_idx]).strip() for r in rows if key_idx < len(r) and str(r[key_idx]).strip()
    }
    renames: dict[str, str] = {}
    for row_num, row in enumerate(rows, start=2):
        if key_idx >= len(row) or name_idx >= len(row):
            continue
        old_key = str(row[key_idx]).strip()
        name = str(row[name_idx]).strip()
        if not old_key or not name:
            continue
        if old_key.startswith(name):
            continue  # prefix already exact
        if not old_key.lower().startswith(name.lower()):
            continue  # key not built from this name at all; not a casing issue
        new_key = name + old_key[len(name):]
        if new_key in existing_keys:
            console.print(
                f"  [bold red][ERROR][/bold red] centers row {row_num}: '{new_key}' already exists. "
                f"Renaming '{old_key}' would create a duplicate key. Fix by hand."
            )
            continue
        renames[old_key] = new_key
    return renames


def apply_key_renames(
    cache: SheetCache, renames: dict[str, str], report: Table, apply_changes: bool
) -> int:
    """Replace old keys with new keys in every sheet that references them."""
    fixed = 0
    for sheet_name in KEY_SHEETS:
        console.print(f"  [bold blue][*][/bold blue] Renaming keys in '{sheet_name}' ...")
        try:
            ws, _, rows = cache.get(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            console.print(f"  [bold yellow][WARN][/bold yellow] Worksheet '{sheet_name}' not found, skipping.")
            continue
        key_idx = cache.column_index(sheet_name, "cn_unique_key")
        if key_idx < 0:
            console.print(f"  [bold yellow][WARN][/bold yellow] No cn_unique_key in '{sheet_name}', skipping.")
            continue

        dirty_cells: list[gspread.Cell] = []
        for row_num, row in enumerate(rows, start=2):
            if key_idx >= len(row):
                continue
            raw = str(row[key_idx])
            new_key = renames.get(raw.strip())
            if new_key is None:
                continue
            a1 = f"{col_letter(key_idx + 1)}{row_num}"
            report.add_row(sheet_name, a1, raw, new_key)
            dirty_cells.append(gspread.Cell(row=row_num, col=key_idx + 1, value=new_key))
            row[key_idx] = new_key

        if not dirty_cells:
            console.print(f"  [bold green][OK][/bold green] '{sheet_name}' has no keys to rename.")
            continue

        fixed += len(dirty_cells)
        if apply_changes:
            safe_api_call(lambda: ws.update_cells(dirty_cells, value_input_option="RAW"))
            time.sleep(0.5)
            console.print(f"  [bold green][OK][/bold green] Renamed {len(dirty_cells)} key(s) in '{sheet_name}'.")
        else:
            console.print(f"  [bold yellow][->][/bold yellow] Would rename {len(dirty_cells)} key(s) in '{sheet_name}'.")
    return fixed


def main() -> None:
    apply_changes = "--apply" in sys.argv

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)

    console.print("[bold blue][*][/bold blue] Opening spreadsheet ...")
    spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    console.print("[bold green][OK][/bold green] Connected.\n")

    if not apply_changes:
        console.print("[bold yellow]DRY RUN[/bold yellow]: no changes will be written. Use --apply to write.\n")

    cache = SheetCache(spreadsheet)
    total_fixed = 0

    report = Table(show_header=True)
    report.add_column("Sheet", style="bold")
    report.add_column("Cell")
    report.add_column("Current value")
    report.add_column("Corrected value")

    for rule in VALIDATION_RULES:
        source_sheet = rule["source_sheet"]
        column = rule["column"]
        console.rule(f"\"{column}\"  --  source of truth: '{source_sheet}'")

        try:
            canonical = build_canonical_map(cache, source_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            console.print(
                f"  [bold red][ERROR][/bold red] Worksheet '{source_sheet}' not found, skipping rule."
            )
            continue

        for sheet_name in rule["target_sheets"]:
            console.print(f"  [bold blue][*][/bold blue] Checking '{sheet_name}' ...")
            try:
                ws, _, rows = cache.get(sheet_name)
            except gspread.exceptions.WorksheetNotFound:
                console.print(
                    f"  [bold yellow][WARN][/bold yellow] Worksheet '{sheet_name}' not found, skipping."
                )
                continue

            col_idx = cache.column_index(sheet_name, column)
            if col_idx < 0:
                console.print(
                    f"  [bold yellow][WARN][/bold yellow] Column '{column}' not in '{sheet_name}', skipping."
                )
                continue

            dirty_cells: list[gspread.Cell] = []
            # Row 1 is the header, so data rows start at sheet row 2.
            for row_num, row in enumerate(rows, start=2):
                if col_idx >= len(row):
                    continue
                raw = str(row[col_idx])
                val = raw.strip()
                if not val:
                    continue
                expected = canonical.get(val.lower())
                # Missing entirely = real mismatch, not a casing issue. Leave it.
                if expected is None or expected == val:
                    continue
                a1 = f"{col_letter(col_idx + 1)}{row_num}"
                report.add_row(sheet_name, a1, raw, expected)
                dirty_cells.append(gspread.Cell(row=row_num, col=col_idx + 1, value=expected))
                # Keep the in-memory copy current so later rules see the fix.
                row[col_idx] = expected

            if not dirty_cells:
                console.print(f"  [bold green][OK][/bold green] '{sheet_name}' casing matches.")
                continue

            total_fixed += len(dirty_cells)
            if apply_changes:
                # RAW so the text is written back verbatim, not reparsed.
                safe_api_call(lambda: ws.update_cells(dirty_cells, value_input_option="RAW"))
                time.sleep(0.5)
                console.print(
                    f"  [bold green][OK][/bold green] Fixed {len(dirty_cells)} cell(s) in '{sheet_name}'."
                )
            else:
                console.print(
                    f"  [bold yellow][->][/bold yellow] Would fix {len(dirty_cells)} cell(s) in '{sheet_name}'."
                )
        console.print()

    # -- Second pass: cn_unique_key carries the account name as its prefix ------
    # Runs on every centers row, so it also catches keys left behind by an
    # earlier run that only fixed the name columns.
    console.rule("\"cn_unique_key\"  --  rebuild prefix from account_global_legal_name")
    key_renames = plan_key_renames(cache)
    if key_renames:
        total_fixed += apply_key_renames(cache, key_renames, report, apply_changes)
    else:
        console.print("  [bold green][OK][/bold green] Every key prefix matches its account name.")
    console.print()

    if total_fixed:
        console.print(report)
        verb = "Fixed" if apply_changes else "Would fix"
        console.print(f"\n[bold]{verb} {total_fixed} cell(s) total.[/bold]")
        if not apply_changes:
            console.print("Re-run with [bold]--apply[/bold] to write these changes.")
        else:
            console.print("Re-run validate.py to confirm the case warnings are gone.")
    else:
        console.print("[bold green][OK][/bold green] No case mismatches found. Nothing to do.")


if __name__ == "__main__":
    main()
