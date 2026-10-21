"""The in-memory copy of the spreadsheet every step works on, and the
single write back at the end."""

import time
from dataclasses import dataclass

import gspread

from common import tui
from common.google import safe_api_call
from sheets.rules import INVISIBLE_CHARS_RE

FIRST_DATA_ROW = 2
WRITE_BATCH = 2000


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
        # Unnamed columns to delete, as 0-based indices per sheet. Deleted
        # after every other write, so all other changes keep their positions;
        # set() and mark() ignore cells in them.
        self.dropped_columns: dict[str, set[int]] = {}
        # Formula text per sheet, keyed (row_idx, col_idx), so a column is
        # only deleted when no formula reads from it.
        self.formula_text: dict[str, dict[tuple[int, int], str]] = {}

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
        self.formula_text[sheet] = {
            (r, c): v
            for r, row in enumerate(formula_data[1:])
            for c, v in enumerate(row)
            if isinstance(v, str) and v.startswith("=")
        }
        self._formulas[sheet] = set(self.formula_text[sheet])
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
        if col_idx in self.dropped_columns.get(sheet, ()):
            return
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
        if col_idx in self.dropped_columns.get(sheet, ()):
            return
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

    def drop_column(self, step: str, sheet: str, col_idx: int, filled: int, example: str, letter: str) -> None:
        """Queue an unnamed column for deletion. Recorded as one change on
        its header cell; write() deletes it after everything else."""
        self.dropped_columns.setdefault(sheet, set()).add(col_idx)
        self.changes.append(
            Change(
                step=step,
                sheet=sheet,
                row=1,
                col=col_idx + 1,
                column=f"{letter} (no header)",
                before=f"{filled:,} filled cells, such as {example}",
                after="(column deleted)",
                note="unnamed column removed",
            )
        )

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
        if self.dropped_columns:
            self._delete_columns()
            n = sum(len(cols) for cols in self.dropped_columns.values())
            tui.line("pass", f"Deleted {tui.plural(n, 'unnamed column')}.")
        return written

    def _delete_columns(self) -> None:
        """Delete the queued columns, right-most first in each sheet so the
        earlier deletions do not shift the later ones."""
        requests = [
            {
                "deleteDimension": {
                    "range": {"sheetId": self._ws[sheet].id, "dimension": "COLUMNS", "startIndex": c, "endIndex": c + 1}
                }
            }
            for sheet, cols in sorted(self.dropped_columns.items())
            for c in sorted(cols, reverse=True)
        ]
        safe_api_call(lambda: self.spreadsheet.batch_update({"requests": requests}))

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
        # The source sheets keep a filter on, so filtered rows must be included.
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
                            },
                            # Without this, rows hidden by an active filter
                            # are skipped and keep their dropdown.
                            "filteredRowsIncluded": True,
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
