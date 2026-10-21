"""Reads every worksheet once and keeps the rows in memory for all phases."""

import sys
import time

import gspread

from common import tui
from common.google import safe_api_call
from common.tui import console


def get_worksheet_rows(
    worksheet: gspread.Worksheet,
) -> tuple[list[str], list[list[str]]]:
    """Fetch all data from a worksheet. Returns (headers, rows)."""
    all_data = safe_api_call(lambda: worksheet.get_all_values())
    if not all_data:
        return [], []
    headers = [str(h).strip().lower() for h in all_data[0]]
    return headers, all_data[1:]


class SheetCache:
    def __init__(self, spreadsheet: gspread.Spreadsheet):
        self.spreadsheet = spreadsheet
        self._cache = {}

    def get_data(self, sheet_name: str) -> tuple[list[str], list[list[str]]]:
        if sheet_name not in self._cache:
            ws = self.spreadsheet.worksheet(sheet_name)
            headers, rows = get_worksheet_rows(ws)
            self._cache[sheet_name] = (headers, rows)
            time.sleep(0.5)  # small buffer after a large read
        return self._cache[sheet_name]

    def preload(self, sheet_names: list[str]) -> None:
        """Read every sheet up front behind one progress bar, so the phases
        run on cached data without pausing between them."""
        timer = tui.Timer()
        missing: list[str] = []
        with tui.loading(len(sheet_names), "Loading sheets") as bar:
            for name in sheet_names:
                bar.start(f"Loading '{name}'")
                try:
                    self.get_data(name)
                except gspread.exceptions.WorksheetNotFound:
                    missing.append(name)
                bar.done()
        loaded = [n for n in sheet_names if n in self._cache]
        total_rows = sum(len(self._cache[n][1]) for n in loaded)
        tui.line(
            "pass",
            f"Loaded {tui.plural(len(loaded), 'sheet')}, {tui.plural(total_rows, 'row')} in {timer}",
        )
        if missing:
            tui.line("warn", f"Not found: {', '.join(missing)}")

    def get_column_values(
        self, sheet_name: str, column_name: str
    ) -> list[tuple[int, str]]:
        headers, rows = self.get_data(sheet_name)
        key = column_name.strip().lower()
        if key not in headers:
            available = ", ".join(headers) or "(no headers found)"
            console.print(
                f"[error][ERROR][/error] Column '{column_name}' not found in sheet '{sheet_name}'.\n"
                f"        Available columns: {available}"
            )
            sys.exit(1)

        col_idx = headers.index(key)
        results: list[tuple[int, str]] = []
        for idx, row in enumerate(rows, start=2):
            if col_idx < len(row):
                stripped = str(row[col_idx]).strip()
                if stripped:
                    results.append((idx, stripped))
        return results
