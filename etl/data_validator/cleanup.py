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
cleanup.py
----------
One pass that cleans the source spreadsheet before validate.py and the ETL
run. Every sheet is read once, every step works on that in-memory copy in a
fixed order, and the final result is written back once per sheet. A cell
touched by several steps is written once, with its final value.

Steps, in the order they run (the order matters, see the notes):

  1. chips        Smart chips become plain text and dropdowns are removed,
                  so every cell is plain text. A people chip holding an
                  email looks like text but VLOOKUP and MATCH skip it.
                  Found from cell metadata (cell_meta.py, validate.py 0C).
  2. artifacts    Spreadsheet error values typed as text (#N/A, #REF!) are
                  cleared, and HTML entities from copied page source
                  ('64 &amp; 65', '&nbsp;') are decoded.
  3. invisible    Strip zero-width characters, BOMs, soft hyphens and
                  bidirectional controls from every cell. (validate.py 0B)
  4. whitespace   Trim cells and lines, collapse double spaces, turn tabs,
                  non-breaking and other exotic spaces into plain spaces,
                  turn \\r into real line breaks. Line breaks are kept.
  5. lists        Free-text list columns (services service columns,
                  accounts key offerings): one item per line, no bullets,
                  no duplicates. In services, all-lowercase words are
                  capitalised and focus_region lines like 'India Global'
                  are split in two.
  6. links        Link columns: one URL per line, bullets, wrapping quotes
                  and separators removed, tracking parameters (utm_*, trk,
                  originalSubdomain) and #:~:text= highlights dropped,
                  LinkedIn hosts made consistent. Lines that are still not
                  URLs are listed for a manual look and never changed.
  7. formats      Values that validate.py Phase 0 would reject but that have
                  one obvious correct form:
                    - dates     '06-May-25', '6 May 2025', '2025-05-06'
                                become '6-May-2025'
                    - months    'jan', 'Sept' become 'January', 'September'
                    - years     '2015.0', '2,015' become '2015'
                    - choices   'active center', 'gcc / gic', '2011-2015'
                                become the exact allowed value
                    - ISO code  'in', 'IND', 'India' become 'IN'
                    - emails    'mailto:' and <> removed, domain lowercased,
                                Cyrillic/Greek lookalike letters made Latin
                    - phones    '+91 98765 43210' becomes '9876543210'
                    - names     prospect names in ALL CAPS or all lowercase
                                get each word capitalised
  8. references   Key columns in child sheets that match the parent sheet
                  except for casing, curly quotes or dash style are
                  rewritten to the parent's exact spelling (this includes
                  subscribers emails against prospects). A cn_unique_key
                  whose prefix no longer matches its account name is
                  rebuilt and renamed in every sheet that uses it.
                  (validate.py Phase 2 case warnings)

Why this order: chips go first so the text they leave behind goes through
every later step like any other value. Entities decode into non-breaking spaces and invisible
characters, so they go first. Invisible characters and stray spaces hide
inside values, so they go next and every later step sees clean text.
Lists and links split and dedupe lines, which only works once the
whitespace is tidy. Formats compare against fixed allowed values, so they
run on tidy text too. References run last because they compare names
across sheets, and two names only compare equal once both sides have been
through 2 to 7.

Formula cells are never written: many columns are formulas
(tech.account_global_legal_name, the range columns in accounts and
centers), and writing a value would replace the formula. A fix a step
wanted on one is listed at the end instead.

The column rules (ALL_RULES, VALIDATION_RULES, INVISIBLE_CHARS) are read
from validate.py's source, so this script follows any rule change there
without a copy to keep in sync.

Dry run by default: prints what would change without touching the
spreadsheet. Pass --apply to write (after a y/N confirmation).

Run with:
    uv run cleanup.py                              # every step, preview
    uv run cleanup.py --apply                      # every step, write
    uv run cleanup.py --steps whitespace,links     # only these steps
    uv run cleanup.py --skip references            # every step but these
    uv run cleanup.py --sheets centers,services    # only change these sheets
    uv run cleanup.py --report changes.csv         # full change list as CSV
    uv run cleanup.py --apply --yes                # write without the y/N question
    uv run cleanup.py --limit 30                   # more example rows per step

With --apply the dry-run report is shown first, then you are asked to
confirm before anything is written.

Then run validate.py to see what is left for a person to fix.

Uses the same .env as validate.py (SPREADSHEET_ID, GOOGLE_SA_FILE).
"""

import argparse
import ast
import csv
import html
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from gspread.utils import rowcol_to_a1
from rich.prompt import Confirm

import cell_meta

# tui.py sits one level up in etl/, shared with the ETL in etl/V2.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import tui  # noqa: E402
from tui import console  # noqa: E402

# -- Configuration ------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
GOOGLE_SA_FILE = os.getenv("GOOGLE_SA_FILE")

if not SPREADSHEET_ID or not GOOGLE_SA_FILE:
    console.print("[error][ERROR][/error] SPREADSHEET_ID or GOOGLE_SA_FILE missing in .env")
    sys.exit(1)

SA_PATH = SCRIPT_DIR / GOOGLE_SA_FILE
if not SA_PATH.exists():
    console.print(f"[error][ERROR][/error] Service-account file not found: {SA_PATH}")
    sys.exit(1)

# Write scope: this script edits the spreadsheet (validate.py is read-only).
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

FIRST_DATA_ROW = 2
WRITE_BATCH = 2000


# -- Rules shared with validate.py --------------------------------------------
def load_validate_constants(*names: str) -> dict:
    """
    Read literal constants from validate.py without importing it. Importing
    would run its module-level setup, which authorises against Google with a
    read-only scope.
    """
    tree = ast.parse((SCRIPT_DIR / "validate.py").read_text(encoding="utf-8"))
    found = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target = node.target
        else:
            continue
        if isinstance(target, ast.Name) and target.id in names:
            found[target.id] = ast.literal_eval(node.value)
    missing = [n for n in names if n not in found]
    if missing:
        console.print(f"[error][ERROR][/error] Not found in validate.py: {', '.join(missing)}")
        sys.exit(1)
    return found


_shared = load_validate_constants("ALL_RULES", "VALIDATION_RULES", "INVISIBLE_CHARS", "ALL_SHEETS")
ALL_RULES: dict[str, dict[str, dict]] = _shared["ALL_RULES"]
VALIDATION_RULES: list[dict] = _shared["VALIDATION_RULES"]
INVISIBLE_CHARS: dict[str, str] = _shared["INVISIBLE_CHARS"]
ALL_SHEETS: list[str] = _shared["ALL_SHEETS"]

INVISIBLE_CHARS_RE = re.compile("[" + "".join(INVISIBLE_CHARS) + "]")

# Same shape as URL_LINE_PATTERN in validate.py: optional scheme or www.,
# a dotted host, optional path, no whitespace.
URL_LINE = re.compile(r"^(https?://|www\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?(/\S*)?$")
LEADING_BULLET = re.compile(r"^([-•·*]+\s*)+")


def rule_desc(rule: dict) -> str:
    """Rule description, lowercased with runs of whitespace collapsed."""
    return re.sub(r"\s+", " ", rule.get("Description", "")).strip().lower()


# -- Sheet state and change log -----------------------------------------------
@dataclass
class Change:
    step: str
    sheet: str
    row: int  # 1-based sheet row
    col: int  # 1-based sheet column
    column: str
    before: str
    after: str
    note: str = ""


class Workbook:
    """
    Every worksheet read once and held in memory. Steps edit the rows through
    set(), which records each change; write() sends the net difference.
    """

    def __init__(self, spreadsheet: gspread.Spreadsheet, editable: list[str]):
        self.spreadsheet = spreadsheet
        self.editable = editable
        self.changes: list[Change] = []
        self._ws: dict[str, gspread.Worksheet] = {}
        self._headers: dict[str, list[str]] = {}
        self._rows: dict[str, list[list[str]]] = {}
        self._original: dict[str, list[list[str]]] = {}
        self._formulas: dict[str, set[tuple[int, int]]] = {}
        self._missing: set[str] = set()
        # Changes a step wanted to make to a formula cell, not applied.
        self.skipped_formulas: list[Change] = []
        # Fixes to a cell's type rather than its text, applied by write():
        # chips to turn into plain text, dropdowns to remove.
        # Keys are (sheet, row_idx, col_idx).
        self.chip_cells: set[tuple[str, int, int]] = set()
        self.dropdown_cells: set[tuple[str, int, int]] = set()

    def load(self, sheet: str) -> bool:
        """Read a worksheet if not read yet. False if it does not exist."""
        if sheet in self._rows:
            return True
        if sheet in self._missing:
            return False
        try:
            ws = self.spreadsheet.worksheet(sheet)
        except gspread.exceptions.WorksheetNotFound:
            self._missing.add(sheet)
            return False
        all_data = safe_api_call(lambda: ws.get_all_values())
        time.sleep(0.5)
        # Header lookup ignores case, surrounding spaces and invisible
        # characters, so a stray BOM in a header does not hide the column.
        self._headers[sheet] = [
            INVISIBLE_CHARS_RE.sub("", str(h)).strip().lower() for h in (all_data[0] if all_data else [])
        ]
        rows = [[str(v) for v in r] for r in all_data[1:]]
        # Formula cells are read too, so they can be left alone: writing the
        # cleaned value would replace the formula with static text. Many
        # columns are formulas (tech.account_global_legal_name, the range
        # columns in accounts and centers).
        formula_data = safe_api_call(lambda: ws.get_all_values(value_render_option="FORMULA"))
        time.sleep(0.5)
        self._formulas[sheet] = {
            (r, c)
            for r, row in enumerate(formula_data[1:])
            for c, v in enumerate(row)
            if isinstance(v, str) and v.startswith("=")
        }
        self._ws[sheet] = ws
        self._rows[sheet] = rows
        self._original[sheet] = [list(r) for r in rows]
        return True

    def preload(self, sheets: list[str]) -> None:
        """Read every sheet up front behind one progress bar."""
        timer = tui.Timer()
        with tui.loading(len(sheets), "Loading sheets") as bar:
            for sheet in sheets:
                bar.start(f"Loading '{sheet}' (values and formulas)")
                self.load(sheet)
                bar.done()
        loaded = [s for s in sheets if s in self._rows]
        total_rows = sum(len(self._rows[s]) for s in loaded)
        tui.line("pass", f"Loaded {tui.plural(len(loaded), 'sheet')}, {tui.plural(total_rows, 'row')} in {timer}")
        missing = [s for s in sheets if s in self._missing]
        if missing:
            tui.line("warn", f"Not found, skipped: {', '.join(missing)}")

    def rows(self, sheet: str) -> list[list[str]]:
        return self._rows[sheet] if self.load(sheet) else []

    def col(self, sheet: str, column: str) -> int:
        """0-based column index, or -1 if the sheet or column is missing."""
        if not self.load(sheet):
            return -1
        key = column.strip().lower()
        headers = self._headers[sheet]
        return headers.index(key) if key in headers else -1

    def header(self, sheet: str, col_idx: int) -> str:
        headers = self._headers.get(sheet, [])
        return headers[col_idx] if col_idx < len(headers) else ""

    def get(self, sheet: str, row_idx: int, col_idx: int) -> str:
        rows = self._rows[sheet]
        # A dropdown can sit on empty rows below the data, which
        # get_all_values() does not return.
        if row_idx >= len(rows):
            return ""
        row = rows[row_idx]
        return row[col_idx] if col_idx < len(row) else ""

    def mark(self, step: str, sheet: str, row_idx: int, col_idx: int, kind: str, note: str) -> None:
        """Record a fix to a cell's type, not its text: kind 'chip' turns a
        chip into plain text, 'dropdown' removes the dropdown. The value is
        unchanged, so the change shows the same text before and after."""
        value = self.get(sheet, row_idx, col_idx)
        change = Change(
            step=step,
            sheet=sheet,
            row=row_idx + FIRST_DATA_ROW,
            col=col_idx + 1,
            column=self.header(sheet, col_idx),
            before=value,
            after=value,
            note=note,
        )
        if (row_idx, col_idx) in self._formulas.get(sheet, set()):
            self.skipped_formulas.append(change)
            return
        target = self.chip_cells if kind == "chip" else self.dropdown_cells
        target.add((sheet, row_idx, col_idx))
        self.changes.append(change)

    def set(self, step: str, sheet: str, row_idx: int, col_idx: int, value: str, note: str = "") -> None:
        """row_idx and col_idx are 0-based positions in the data rows."""
        before = self.get(sheet, row_idx, col_idx)
        if before == value:
            return
        change = Change(
            step=step,
            sheet=sheet,
            row=row_idx + FIRST_DATA_ROW,
            col=col_idx + 1,
            column=self.header(sheet, col_idx),
            before=before,
            after=value,
            note=note,
        )
        if (row_idx, col_idx) in self._formulas.get(sheet, set()):
            self.skipped_formulas.append(change)
            return
        row = self._rows[sheet][row_idx]
        while len(row) <= col_idx:
            row.append("")
        row[col_idx] = value
        self.changes.append(change)

    def cells(self, sheet: str):
        """Every non-empty (row_idx, col_idx, value) in a sheet's data rows."""
        for r, row in enumerate(self.rows(sheet)):
            for c, value in enumerate(row):
                if value:
                    yield r, c, value

    def column_cells(self, sheet: str, column: str):
        """Every non-empty (row_idx, col_idx, value) in one column."""
        c = self.col(sheet, column)
        if c < 0:
            return
        for r, row in enumerate(self.rows(sheet)):
            value = row[c] if c < len(row) else ""
            if value:
                yield r, c, value

    def write(self) -> dict[str, int]:
        """Write each sheet's net changes. Returns cells written per sheet."""
        written: dict[str, int] = {}
        with tui.loading(len(self._rows), "Writing") as bar:
            for sheet in self._rows:
                bar.start(f"Writing '{sheet}'")
                n = self._write_sheet(sheet)
                if n:
                    written[sheet] = n
                bar.done()
        for sheet, n in written.items():
            tui.line("pass", f"{sheet}: wrote {tui.plural(n, 'cell')}")
        if self.chip_cells or self.dropdown_cells:
            self._write_cell_types()
            tui.line(
                "pass",
                f"Turned {tui.plural(len(self.chip_cells), 'chip')} into text, removed "
                f"{tui.plural(len(self.dropdown_cells), 'dropdown cell')}.",
            )
        return written

    def _write_cell_types(self) -> None:
        """Apply the chip and dropdown fixes with the Sheets batchUpdate API:
        update_cells() can only change values, not chips or validation."""
        requests: list[dict] = []
        for sheet, r, c in sorted(self.chip_cells):
            # Writing the value with chipRuns in the field mask but not in the
            # data clears the chip and leaves plain text.
            requests.append(
                {
                    "updateCells": {
                        "start": {"sheetId": self._ws[sheet].id, "rowIndex": r + FIRST_DATA_ROW - 1, "columnIndex": c},
                        "rows": [{"values": [{"userEnteredValue": {"stringValue": self.get(sheet, r, c)}}]}],
                        "fields": "userEnteredValue,chipRuns",
                    }
                }
            )
        # Dropdowns usually cover a run of rows in one column, so clear each
        # run with one request. setDataValidation without a rule removes it.
        by_column: dict[tuple[str, int], list[int]] = {}
        for sheet, r, c in self.dropdown_cells:
            by_column.setdefault((sheet, c), []).append(r)
        for (sheet, c), rows in sorted(by_column.items()):
            rows.sort()
            start = prev = rows[0]
            for r in rows[1:] + [None]:
                if r is not None and r == prev + 1:
                    prev = r
                    continue
                requests.append(
                    {
                        "setDataValidation": {
                            "range": {
                                "sheetId": self._ws[sheet].id,
                                "startRowIndex": start + FIRST_DATA_ROW - 1,
                                "endRowIndex": prev + FIRST_DATA_ROW,
                                "startColumnIndex": c,
                                "endColumnIndex": c + 1,
                            }
                        }
                    }
                )
                if r is not None:
                    start = prev = r
        for i in range(0, len(requests), 500):
            batch = requests[i : i + 500]
            safe_api_call(lambda: self.spreadsheet.batch_update({"requests": batch}))
            time.sleep(0.5)

    def _write_sheet(self, sheet: str) -> int:
        """Write one sheet's net changes. Returns how many cells."""
        rows = self._rows[sheet]
        original = self._original[sheet]
        dirty: list[gspread.Cell] = []
        for r, row in enumerate(rows):
            before = original[r]
            for c, value in enumerate(row):
                if value != (before[c] if c < len(before) else ""):
                    dirty.append(gspread.Cell(row=r + FIRST_DATA_ROW, col=c + 1, value=value))
        if not dirty:
            return 0
        ws = self._ws[sheet]
        for i in range(0, len(dirty), WRITE_BATCH):
            batch = dirty[i : i + WRITE_BATCH]
            # RAW so the text is written back verbatim, not reparsed by Sheets.
            safe_api_call(lambda: ws.update_cells(batch, value_input_option="RAW"))
            time.sleep(0.5)
        return len(dirty)


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


# -- Step 1: chips and dropdowns ----------------------------------------------
def step_chips(wb: Workbook) -> None:
    """Every cell should be plain text. Chips and dropdowns are found from
    cell metadata (see cell_meta.py), one extra API read per sheet."""
    metas: dict[str, cell_meta.CellMeta] = {}
    with tui.loading(len(wb.editable), "Reading cell metadata") as bar:
        for sheet in wb.editable:
            bar.start(f"Reading chips and dropdowns in '{sheet}'")
            metas[sheet] = safe_api_call(lambda: cell_meta.fetch(wb.spreadsheet, sheet))
            bar.done()

    # Chips first so the report leads with them: they are the few cells that
    # break lookups, while dropdowns tend to cover whole columns.
    for sheet, meta in metas.items():
        for chip in meta.chips:
            r = chip.row - FIRST_DATA_ROW
            # A link chip shows its page title; the text it becomes is the URL.
            if r < len(wb.rows(sheet)) and chip.text != wb.get(sheet, r, chip.col):
                wb.set("chips", sheet, r, chip.col, chip.text, f"{chip.kind} chip, URL kept")
            wb.mark("chips", sheet, r, chip.col, "chip", f"{chip.kind} chip to text")
    for sheet, meta in metas.items():
        for dropdown in meta.dropdowns:
            wb.mark("chips", sheet, dropdown.row - FIRST_DATA_ROW, dropdown.col, "dropdown", "dropdown removed")


# -- Step 2: paste artifacts --------------------------------------------------
# HTML entities left behind by copying from a page's source ('64 &amp; 65').
# Only these few are decoded: a bare '&' followed by text is real data.
HTML_ENTITY_RE = re.compile(r"&(amp|nbsp|quot|apos|lt|gt|#\d{1,6}|#x[0-9a-fA-F]{1,5});")
# Spreadsheet error values typed or pasted as text. validate.py already
# treats '#N/A' as empty; the ETL would import it as the literal text.
ERROR_VALUES = {"#N/A", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?", "#NUM!", "#NULL!", "#ERROR!"}


def step_artifacts(wb: Workbook) -> None:
    for sheet in wb.editable:
        for r, c, value in wb.cells(sheet):
            if value.strip().upper() in ERROR_VALUES:
                wb.set("artifacts", sheet, r, c, "", "spreadsheet error value")
            elif HTML_ENTITY_RE.search(value):
                decoded = HTML_ENTITY_RE.sub(lambda m: html.unescape(m.group(0)), value)
                wb.set("artifacts", sheet, r, c, decoded, "HTML entity")


# -- Step 3: invisible characters ---------------------------------------------
def step_invisible(wb: Workbook) -> None:
    for sheet in wb.editable:
        for r, c, value in wb.cells(sheet):
            hits = INVISIBLE_CHARS_RE.findall(value)
            if hits:
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                wb.set("invisible", sheet, r, c, INVISIBLE_CHARS_RE.sub("", value), kinds)


# -- Step 4: whitespace -------------------------------------------------------
# Unicode spaces that render like a normal space but are a different code
# point. All of them become a plain ASCII space.
EXOTIC_SPACES_RE = re.compile("[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]")


def clean_whitespace(value: str) -> str:
    """Normalise whitespace while keeping intentional line breaks."""
    value = EXOTIC_SPACES_RE.sub(" ", value)
    # Some cells were pasted with bare \r as the line separator. Treat it as a
    # line break rather than deleting it, which would glue two lines together.
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


def step_whitespace(wb: Workbook) -> None:
    for sheet in wb.editable:
        for r, c, value in wb.cells(sheet):
            wb.set("whitespace", sheet, r, c, clean_whitespace(value))


# -- Step 5: list text columns ------------------------------------------------
LIST_COLUMNS = {
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
# Sheets where ' - ' joins two separate items. In accounts it joins a product
# to its description ('AgentOS - AI Agents Platform'), so it is kept there.
SPLIT_ON_HYPHEN = {"services"}
# Sheets whose list items are short labels that should read in title case.
# Key offerings are product descriptions written as sentences, so their
# casing is left as typed.
FIX_CASE = {"services"}

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


def fix_case(item: str) -> str:
    """Capitalise all-lowercase words; leave words with any capital alone."""
    out = []
    for i, w in enumerate(item.split(" ")):
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
        for n in range(min(_MAX_REGION_WORDS, len(words) - i), 0, -1):
            cand = " ".join(words[i : i + n])
            if cand.lower() in _REGION_LOOKUP:
                parts.append(_REGION_LOOKUP[cand.lower()])
                i += n
                break
        else:
            return [line]
    return parts if len(parts) > 1 else [line]


def normalise_list(value: str, column: str, sheet: str) -> str:
    separator = INLINE_SEPARATOR_FULL if sheet in SPLIT_ON_HYPHEN else INLINE_SEPARATOR_BULLET_ONLY
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
                if sheet in FIX_CASE:
                    p = fix_case(p)
                if p not in items:
                    items.append(p)
    return "\n".join(items)


def step_lists(wb: Workbook) -> None:
    for sheet, columns in LIST_COLUMNS.items():
        if sheet not in wb.editable:
            continue
        for column in columns:
            for r, c, value in wb.column_cells(sheet, column):
                wb.set("lists", sheet, r, c, normalise_list(value, column, sheet))


# -- Step 6: link columns -----------------------------------------------------
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
JUNK_TOKEN = re.compile(r"^[|.,;:\-`'\"]+$")


def tidy_url(token: str) -> str:
    """Strip junk that wraps a URL: quotes, a leading '.', trailing comma."""
    token = token.strip().strip("\"'")
    token = re.sub(r"^\.+(?=[A-Za-z])", "", token)
    token = re.sub(r"[,;]+$", "", token)
    # Again, for a quote that sat inside a trailing comma: "'https://x.com',"
    return token.strip("\"'")


# Query parameters that only record where a link was clicked. Removing them
# makes the same page compare equal however it was copied. Anything else in
# the query (Sales Navigator's ?query=, job board ids) is kept.
TRACKING_PARAM = re.compile(
    r"^(utm_\w+|trk|trkInfo|trackingId|lipi|originalSubdomain|original_referer|fbclid|gclid)$",
    re.IGNORECASE,
)
URL_PARTS = re.compile(r"^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$")
LINKEDIN_HOST = re.compile(r"^(https?://)?([a-z]{2,3}\.|www\.)?linkedin\.com(?=/|$)", re.IGNORECASE)


def tidy_url_parts(url: str) -> str:
    """Drop tracking parameters and text-highlight fragments (#:~:text=...),
    and give LinkedIn links one scheme and host."""
    base, query, fragment = URL_PARTS.match(url).groups()
    if query is not None:
        kept = [p for p in query.split("&") if p and not TRACKING_PARAM.match(p.split("=", 1)[0])]
        query = "&".join(kept) or None
    # '#:~:text=' is a browser highlight, and a bare '#' or '#:' is what is
    # left when one was cut off. Real anchors (#careers) are kept.
    if fragment is not None and (fragment in ("", ":") or fragment.startswith(":~:")):
        fragment = None

    def linkedin(m: re.Match) -> str:
        scheme = "https://" if m.group(1) else ""
        host = "www.linkedin.com" if m.group(2) else "linkedin.com"
        return scheme + host

    base = LINKEDIN_HOST.sub(linkedin, base)
    return base + (f"?{query}" if query else "") + (f"#{fragment}" if fragment else "")


def normalise_links(value: str) -> str:
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        if not line:
            continue
        tokens = [tidy_url(t) for t in line.split()]
        # Drop separators and stray punctuation between URLs: '|', '.', '-', '`'.
        tokens = [t for t in tokens if t and not JUNK_TOKEN.match(t)]
        # Split only when every part looks like a URL. A line with plain text
        # in it ('32AANFB3386M1Z3 Gst No.') is left whole for a manual look.
        pieces = tokens if tokens and all(URL_LINE.match(t) for t in tokens) else [tidy_url(line)]
        for p in pieces:
            if URL_LINE.match(p):
                p = tidy_url_parts(p)
            if p and p not in items:
                items.append(p)
    return "\n".join(items)


# Lines that are still not a URL after cleaning, for the end-of-run report.
LINK_LEFTOVERS: list[tuple[str, str, str, str]] = []


def step_links(wb: Workbook) -> None:
    for sheet, columns in LINK_COLUMNS.items():
        if sheet not in wb.editable:
            continue
        for column in columns:
            for r, c, value in wb.column_cells(sheet, column):
                if value.strip() == "#N/A":
                    continue
                cleaned = normalise_links(value)
                wb.set("links", sheet, r, c, cleaned)
                for line in cleaned.split("\n"):
                    if not URL_LINE.match(line):
                        a1 = rowcol_to_a1(r + FIRST_DATA_ROW, c + 1)
                        LINK_LEFTOVERS.append((sheet, a1, column, line))


# -- Step 7: formats ----------------------------------------------------------
MONTHS = [datetime(2000, m, 1).strftime("%B") for m in range(1, 13)]
MONTH_LOOKUP = {m.lower(): m for m in MONTHS} | {m[:3].lower(): m for m in MONTHS} | {"sept": "September"}

DATE_FORMATS = [
    "%d-%B-%Y", "%d-%b-%Y", "%d-%B-%y", "%d-%b-%y",
    "%d %B %Y", "%d %b %Y", "%d %B, %Y", "%d %b, %Y",
    "%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%b %d %Y",
    "%Y-%m-%d",
]

# Treated as the same character when matching a value to an allowed choice.
DASHES_RE = re.compile("[\u2010-\u2015\u2212]")


def fix_date(value: str) -> str | None:
    """'06-May-25' -> '6-May-2025'. None if it is not a date we can read
    unambiguously. Slash dates (05/06/2025) are left alone: day and month
    order cannot be told apart."""
    text = DASHES_RE.sub("-", value)
    text = re.sub(r"(?i)\bsept\b", "Sep", text)
    for fmt in DATE_FORMATS:
        try:
            d = datetime.strptime(text, fmt)
        except ValueError:
            continue
        fixed = f"{d.day}-{d.strftime('%B')}-{d.year}"
        return fixed if fixed != value else None
    return None


def fix_month(value: str) -> str | None:
    return MONTH_LOOKUP.get(value.strip().rstrip(".").lower())


def fix_year(value: str) -> str | None:
    """'2015.0' or '2,015' -> '2015'."""
    m = re.match(r"^(\d),?(\d{3})(\.0+)?$", value)
    return m.group(1) + m.group(2) if m else None


def choice_key(value: str) -> str:
    return re.sub(r"\s+", "", DASHES_RE.sub("-", value)).lower()


def choice_map(allowed: list[str]) -> dict[str, str]:
    """Loose key -> exact allowed value. Keys shared by two allowed values
    are dropped: there is no single right answer for them."""
    by_key: dict[str, list[str]] = {}
    for a in allowed:
        by_key.setdefault(choice_key(a), []).append(a)
    return {k: v[0] for k, v in by_key.items() if len(v) == 1}


# Cyrillic and Greek letters that look exactly like Latin ones. An email
# containing one ('ѕuchismita@...', with a Cyrillic s) fails validation and
# never matches the real address. Built from code points so the table stays
# readable: each pair is (lookalike, Latin letter).
LOOKALIKES = str.maketrans({
    chr(cp): latin
    for cp, latin in [
        (0x0430, "a"), (0x0435, "e"), (0x043E, "o"), (0x0440, "p"), (0x0441, "c"),
        (0x0443, "y"), (0x0445, "x"), (0x0455, "s"), (0x0456, "i"), (0x0458, "j"),
        (0x0501, "d"), (0x04BB, "h"), (0x04CF, "l"),
        (0x0410, "A"), (0x0412, "B"), (0x0415, "E"), (0x041A, "K"), (0x041C, "M"),
        (0x041D, "H"), (0x041E, "O"), (0x0420, "P"), (0x0421, "C"), (0x0422, "T"),
        (0x0425, "X"), (0x0405, "S"), (0x0406, "I"), (0x0408, "J"),
        (0x03BF, "o"), (0x03B1, "a"), (0x03BD, "v"), (0x03C1, "p"), (0x03B9, "i"),
        (0x039F, "O"), (0x0391, "A"), (0x0392, "B"), (0x0395, "E"), (0x039A, "K"),
        (0x039C, "M"), (0x039D, "N"), (0x03A4, "T"), (0x03A7, "X"),
    ]
})


def fix_email(value: str) -> str | None:
    text = re.sub(r"(?i)^mailto:", "", value.strip()).strip("<>").strip()
    text = text.translate(LOOKALIKES)
    if "@" not in text:
        return None
    local, _, domain = text.rpartition("@")
    return f"{local}@{domain.lower().rstrip('.')}"


def fix_phone(value: str) -> str | None:
    """'+91 98765 43210', '098765-43210', '9876543210.0' -> '9876543210'.
    Anything that does not come out as exactly 10 digits (two numbers in one
    cell, a landline with area code) is left for validate.py to report."""
    digits = re.sub(r"\D", "", re.sub(r"\.0+$", "", value.strip()))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


# Person-name columns. Typed in ALL CAPS or all lowercase, they get each word
# capitalised: 'SANDEEP KUMAR' -> 'Sandeep Kumar', "annie d'souza" ->
# "Annie D'Souza". Names with any mixed case are left as typed, so McDonald
# and deSouza survive.
NAME_COLUMNS = {
    "prospects": ["prospect_full_name", "prospect_first_name", "prospect_last_name"],
}
NAME_WORD = re.compile(r"[^\W\d_]+")


def fix_name(value: str) -> str | None:
    if re.search(r"[\d@/]", value) or not NAME_WORD.search(value):
        return None
    if value != value.upper() and value != value.lower():
        return None

    def word(m: re.Match) -> str:
        w = m.group(0)
        # Up to three letters with no vowel are initials: 'bc' -> 'BC'.
        if len(w) <= 3 and not re.search(r"[aeiouy]", w, re.IGNORECASE):
            return w.upper()
        return w.capitalize()

    fixed = NAME_WORD.sub(word, value.lower())
    return fixed if fixed != value else None


def step_formats(wb: Workbook) -> None:
    for sheet in wb.editable:
        for column, rule in ALL_RULES.get(sheet, {}).items():
            desc = rule_desc(rule)
            raw_desc = rule.get("Description", "")
            fixer = None
            note = ""
            # Same precedence as check_table_format in validate.py: the date
            # rule's description also contains '||', so it is tested first.
            if "date in this exact format" in desc:
                fixer, note = fix_date, "date"
            elif "||" in raw_desc:
                allowed = [x.strip() for x in raw_desc.split("||")[1:] if x.strip()]
                lookup = choice_map(allowed)
                exact = set(allowed)

                def fixer(v, lookup=lookup, exact=exact):
                    return None if v in exact else lookup.get(choice_key(v))

                note = "allowed value"
            elif "valid month" in desc:
                fixer, note = fix_month, "month"
            elif "valid year" in desc:
                fixer, note = fix_year, "year"
            elif "iso code should be in" in desc:
                fixer, note = (lambda v: "IN" if v.lower() in ("in", "ind", "india") else None), "ISO code"
            elif "valid email" in desc:
                fixer, note = fix_email, "email"
            elif "10 digit phone" in desc:
                fixer, note = fix_phone, "phone"
            if fixer is None:
                continue
            for r, c, value in wb.column_cells(sheet, column):
                fixed = fixer(value)
                if fixed is not None:
                    wb.set("formats", sheet, r, c, fixed, note)

        for column in NAME_COLUMNS.get(sheet, []):
            for r, c, value in wb.column_cells(sheet, column):
                fixed = fix_name(value)
                if fixed is not None:
                    wb.set("formats", sheet, r, c, fixed, "name casing")


# -- Step 8: references across sheets -----------------------------------------
# Sheets that carry cn_unique_key. When a key is renamed in 'centers', the
# same rename is applied to every one of these.
KEY_SHEETS = ["centers", "services", "functions", "tech"]

QUOTE_FOLD = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
                            "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"'})


def fold(value: str) -> str:
    """Matching key: ignores case, curly versus straight quotes, dash style."""
    return DASHES_RE.sub("-", value.translate(QUOTE_FOLD)).casefold()


def canonical_spellings(wb: Workbook, sheet: str, column: str) -> dict[str, str]:
    """Folded value -> exact spelling in the source sheet. First occurrence
    wins, matching validate.py. Warns when the source itself is inconsistent."""
    canonical: dict[str, str] = {}
    conflicts: dict[str, set[str]] = {}
    for _, _, value in wb.column_cells(sheet, column):
        val = value.strip()
        key = fold(val)
        canonical.setdefault(key, val)
        if canonical[key] != val:
            conflicts.setdefault(key, {canonical[key]}).add(val)
    if conflicts:
        tui.line(
            "warn",
            f"'{sheet}' spells {tui.plural(len(conflicts), column + ' value')} more than one way. "
            f"The first spelling wins; fix '{sheet}' by hand if that is wrong:",
        )
        for key, spellings in sorted(conflicts.items()):
            tui.note(f"{' / '.join(sorted(spellings))}  →  keeps '{canonical[key]}'", indent=6)
    return canonical


def plan_key_renames(wb: Workbook) -> dict[str, str]:
    """
    cn_unique_key is account name + center name + type + focus + city +
    sequence number. If a key starts with the row's account name only when
    case and quotes are ignored, rebuild it with the current name as the
    prefix. Returns {old_key: new_key}.
    """
    key_idx = wb.col("centers", "cn_unique_key")
    name_idx = wb.col("centers", "account_global_legal_name")
    if key_idx < 0 or name_idx < 0:
        return {}
    rows = wb.rows("centers")
    existing = {wb.get("centers", r, key_idx).strip() for r in range(len(rows))}
    renames: dict[str, str] = {}
    for r in range(len(rows)):
        old_key = wb.get("centers", r, key_idx).strip()
        name = wb.get("centers", r, name_idx).strip()
        if not old_key or not name or old_key.startswith(name):
            continue
        if not fold(old_key).startswith(fold(name)):
            continue  # key not built from this name at all
        new_key = name + old_key[len(name):]
        if new_key in existing:
            tui.line(
                "fail",
                f"centers row {r + FIRST_DATA_ROW}: renaming '{old_key}' would duplicate "
                f"'{new_key}'. Fix by hand.",
            )
            continue
        renames[old_key] = new_key
    return renames


def step_references(wb: Workbook) -> None:
    for rule in VALIDATION_RULES:
        source, column = rule["source_sheet"], rule["column"]
        if wb.col(source, column) < 0:
            tui.line("warn", f"No '{column}' in '{source}', rule skipped.")
            continue
        canonical = canonical_spellings(wb, source, column)
        for target in rule["target_sheets"]:
            if target not in wb.editable:
                continue
            for r, c, value in wb.column_cells(target, column):
                expected = canonical.get(fold(value.strip()))
                # Missing entirely is a real mismatch, not a spelling issue.
                if expected is not None:
                    wb.set("references", target, r, c, expected, f"matches {source}")

    renames = plan_key_renames(wb)
    if not renames:
        return
    blocked = [s for s in KEY_SHEETS if s not in wb.editable]
    if blocked:
        tui.line(
            "warn",
            f"{tui.plural(len(renames), 'cn_unique_key rename')} skipped: they must change every key "
            f"sheet at once, and {', '.join(blocked)} is excluded by --sheets.",
        )
        return
    for sheet in KEY_SHEETS:
        for r, c, value in wb.column_cells(sheet, "cn_unique_key"):
            new_key = renames.get(value.strip())
            if new_key is not None:
                wb.set("references", sheet, r, c, new_key, "key prefix rebuilt")


# -- Runner -------------------------------------------------------------------
STEPS = [
    ("chips", step_chips),
    ("artifacts", step_artifacts),
    ("invisible", step_invisible),
    ("whitespace", step_whitespace),
    ("lists", step_lists),
    ("links", step_links),
    ("formats", step_formats),
    ("references", step_references),
]
STEP_NAMES = [name for name, _ in STEPS]
# One line under each step's heading.
STEP_INFO = {
    "chips": "Smart chips turned into plain text; dropdowns removed.",
    "artifacts": "Spreadsheet error values typed as text, and HTML entities.",
    "invisible": "Zero-width characters, BOMs, soft hyphens, direction marks.",
    "whitespace": "Stray, doubled and non-standard spaces; line breaks are kept.",
    "lists": "One item per line in the services and key-offerings list columns.",
    "links": "One clean URL per line in every link column.",
    "formats": "Dates, months, years, allowed values, emails, phones, names.",
    "references": "Key spellings matched to their source-of-truth sheet.",
}


def csv_list(text: str | None) -> list[str]:
    return [s.strip() for s in (text or "").split(",") if s.strip()]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean the source spreadsheet in one ordered pass. Dry run unless --apply is given."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the spreadsheet.")
    parser.add_argument("--steps", help=f"Only run these steps (comma-separated): {','.join(STEP_NAMES)}.")
    parser.add_argument("--skip", help="Run every step except these (comma-separated).")
    parser.add_argument(
        "--sheets",
        help=f"Only change these sheets (comma-separated). Others are still read where a step needs them. "
        f"Default: {','.join(ALL_SHEETS)}.",
    )
    parser.add_argument("--report", help="Write every change to this CSV file.")
    parser.add_argument("--limit", type=int, default=10, help="Example rows shown per step (default 10, 0 hides them).")
    parser.add_argument("--yes", action="store_true", help="With --apply, write without asking to confirm.")
    args = parser.parse_args()

    for flag in ("steps", "skip"):
        unknown = [s for s in csv_list(getattr(args, flag)) if s not in STEP_NAMES]
        if unknown:
            parser.error(f"--{flag}: unknown step(s) {', '.join(unknown)}. Known: {', '.join(STEP_NAMES)}")
    unknown = [s for s in csv_list(args.sheets) if s not in ALL_SHEETS]
    if unknown:
        parser.error(f"--sheets: unknown sheet(s) {', '.join(unknown)}. Known: {', '.join(ALL_SHEETS)}")
    return args


def print_step_report(changes: list[Change], skipped: int, show: int) -> None:
    if not changes:
        tui.line("pass", "Nothing to change.")
    else:
        per_sheet: dict[str, int] = {}
        for ch in changes:
            per_sheet[ch.sheet] = per_sheet.get(ch.sheet, 0) + 1
        counts = ", ".join(f"{s} {tui.num(n)}" for s, n in per_sheet.items())
        tui.line("info", f"{tui.plural(len(changes), 'cell')} to change  [muted]({counts})[/muted]")
        if show:
            examples = tui.table("Sheet", "Cell", "Column", "Before~", "After~", "Why")
            rows = [
                (
                    ch.sheet,
                    rowcol_to_a1(ch.row, ch.col),
                    ch.column,
                    f"[muted]{tui.clip(ch.before, 80) or '(blank)'}[/muted]",
                    tui.clip(ch.after, 80) or "[muted](blank)[/muted]",
                    ch.note,
                )
                for ch in changes
            ]
            for row in rows[:show]:
                examples.add_row(*row)
            tui.print_table(examples)
            if len(rows) > show:
                tui.note(f"... and {tui.plural(len(rows) - show, 'more cell')}. --report writes them all to a CSV.")
    if skipped:
        tui.line("skip", f"{tui.plural(skipped, 'formula cell')} left alone (listed at the end).")


def write_report(path: str, changes: list[Change], skipped: list[Change]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["status", "step", "sheet", "cell", "column", "before", "after", "why"])
        for status, rows in (("changed", changes), ("skipped: formula cell", skipped)):
            for ch in rows:
                writer.writerow(
                    [status, ch.step, ch.sheet, rowcol_to_a1(ch.row, ch.col), ch.column, ch.before, ch.after, ch.note]
                )
    tui.line("pass", f"Wrote {tui.plural(len(changes) + len(skipped), 'row')} to {path}")


def print_manual_review(wb: Workbook, show: int) -> None:
    """What the run found but will not change: link lines that are still not
    URLs, and fixes that landed on formula cells."""
    if not LINK_LEFTOVERS and not wb.skipped_formulas:
        return
    tui.section("Needs a person")
    if LINK_LEFTOVERS:
        tui.line("warn", f"{tui.plural(len(LINK_LEFTOVERS), 'link line')} still not a URL after cleaning.")
        leftovers = tui.table("Sheet", "Cell", "Column", "Line~")
        tui.capped(
            leftovers,
            [(s, a1, col, tui.clip(line, 70)) for s, a1, col, line in LINK_LEFTOVERS],
            show or 1,
            "line",
        )
    if wb.skipped_formulas:
        tui.line(
            "warn",
            f"{tui.plural(len(wb.skipped_formulas), 'fix', 'fixes')} not applied: the cells hold "
            "formulas. Fix the cells the formula reads from instead.",
        )
        per_column: dict[tuple[str, str, str], int] = {}
        for ch in wb.skipped_formulas:
            key = (ch.sheet, ch.column, ch.step)
            per_column[key] = per_column.get(key, 0) + 1
        formulas = tui.table("Sheet", "Column", "Step", "Cells#")
        for (sheet, column, step), n in sorted(per_column.items()):
            formulas.add_row(sheet, column, step, tui.num(n))
        tui.print_table(formulas)


def confirm_write(cells: int, title: str, assume_yes: bool) -> bool:
    """Ask before writing. --yes skips the question; without a terminal to
    ask on, --yes is required."""
    if assume_yes:
        return True
    if not sys.stdin.isatty():
        tui.line("fail", "Not writing: no terminal to confirm on. Pass --yes to write without asking.")
        return False
    console.print()
    return Confirm.ask(
        f"  Write [bold]{tui.num(cells)}[/bold] cell(s) to [bold]{title}[/bold]?",
        console=console,
        default=False,
    )


def main() -> None:
    args = parse_args()
    wanted = csv_list(args.steps) or STEP_NAMES
    skipped_steps = set(csv_list(args.skip))
    # Always canonical order, whatever order the flags list them in.
    steps = [(n, fn) for n, fn in STEPS if n in wanted and n not in skipped_steps]
    editable = csv_list(args.sheets) or list(ALL_SHEETS)

    credentials = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    gc = gspread.authorize(credentials)
    with console.status("Connecting to Google Sheets ...", spinner_style="info"):
        spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))

    tui.header(
        "cleanup",
        [
            ("Spreadsheet", f"[bold]{spreadsheet.title}[/bold]"),
            (
                "Mode",
                "[error]apply: writes to the sheet after you confirm[/error]"
                if args.apply
                else "dry run: nothing is written",
            ),
            ("Steps", " → ".join(n for n, _ in steps)),
            ("Sheets", "all" if editable == list(ALL_SHEETS) else ", ".join(editable)),
        ],
    )

    wb = Workbook(spreadsheet, editable)
    wb.preload(editable)
    wb.editable = [s for s in editable if wb.load(s)]

    for number, (name, fn) in enumerate(steps, start=1):
        tui.section(f"Step {number} · {name}")
        tui.note(STEP_INFO[name], indent=2)
        start = len(wb.changes)
        skipped_start = len(wb.skipped_formulas)
        fn(wb)
        print_step_report(wb.changes[start:], len(wb.skipped_formulas) - skipped_start, args.limit)

    print_manual_review(wb, args.limit)

    tui.section("Summary")
    touched = len({(ch.sheet, ch.row, ch.col) for ch in wb.changes})
    rows = []
    for number, (name, _) in enumerate(steps, start=1):
        n = sum(1 for ch in wb.changes if ch.step == name)
        rows.append(
            (str(number), name, "info" if n else "pass", tui.plural(n, "change") if n else "[muted]clean[/muted]")
        )
    tui.summary(rows)
    if args.report:
        write_report(args.report, wb.changes, wb.skipped_formulas)

    needs_person = len(LINK_LEFTOVERS) + len(wb.skipped_formulas)
    review_step = (
        [f"{tui.plural(needs_person, 'item')} under [bold]Needs a person[/bold] above can't be fixed automatically."]
        if needs_person
        else []
    )

    if not wb.changes:
        tui.verdict("pass", "Already clean · nothing to change", review_step)
        return

    if not args.apply:
        tui.verdict(
            "warn",
            f"Dry run · {tui.plural(touched, 'cell')} would change",
            [
                "[bold]--apply[/bold] writes these changes (you are asked to confirm first).",
                *([] if args.report else ["[bold]--report changes.csv[/bold] saves every change for review."]),
                *review_step,
            ],
        )
        return

    if not confirm_write(touched, spreadsheet.title, args.yes):
        tui.verdict("warn", "Nothing written", ["Re-run with [bold]--apply[/bold] when ready."])
        return

    written = wb.write()
    tui.verdict(
        "pass",
        f"Wrote {tui.plural(sum(written.values()), 'cell')} to {tui.plural(len(written), 'sheet')}",
        ["[bold]uv run validate.py[/bold] shows what is left to fix by hand.", *review_step],
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped. Nothing more will be written.[/warning]")
        sys.exit(130)
