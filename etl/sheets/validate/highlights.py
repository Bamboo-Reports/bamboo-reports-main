"""--highlight: colours failing rows and cells in the sheet after the run."""

import gspread

from common import tui
from common.google import safe_api_call
from sheets.rules import ALL_SHEETS

from . import options
from .options import is_excluded
from .sheet_cache import SheetCache

# -- Issue highlighting -------------------------------------------------------
# Every phase records (sheet, row, column) for each failure it finds. With
# --highlight these are painted into the spreadsheet at the end of the run:
# the whole row yellow, the offending cell red.
HIGHLIGHT_ROW_COLOR = {"red": 1.0, "green": 0.949, "blue": 0.6}  # yellow
HIGHLIGHT_CELL_COLOR = {"red": 0.957, "green": 0.51, "blue": 0.51}  # red

# sheet -> row (1-based) -> set of 0-based column indices (empty set = row only)
ISSUE_CELLS: dict[str, dict[int, set[int]]] = {}


def record_issue(
    sheet: str,
    row: int,
    column: "str | int | None" = None,
    headers: "list[str] | None" = None,
) -> None:
    """Remember a failing cell for --highlight.

    `column` may be a header name (resolved against `headers`), a 0-based
    column index, or None to flag the row without a specific cell.
    """
    cols = ISSUE_CELLS.setdefault(sheet, {}).setdefault(row, set())
    if column is None:
        return
    if isinstance(column, int):
        cols.add(column)
        return
    if headers is None:
        return
    key = column.strip().lower()
    if key in headers:
        cols.add(headers.index(key))


def _batch_update(spreadsheet: gspread.Spreadsheet, requests: list[dict]) -> None:
    chunk_size = 500
    for start in range(0, len(requests), chunk_size):
        chunk = requests[start : start + chunk_size]
        safe_api_call(lambda chunk=chunk: spreadsheet.batch_update({"requests": chunk}))


def apply_highlights(cache: SheetCache) -> None:
    """Paint recorded issues into the spreadsheet (rows yellow, cells red)."""
    if not options.highlight:
        return

    tui.section("Highlighting issues in the sheet")

    try:
        sheet_ids = {ws.title: ws.id for ws in safe_api_call(cache.spreadsheet.worksheets)}
    except gspread.exceptions.APIError as exc:
        tui.line("fail", f"Could not list worksheets: {exc}")
        return

    requests: list[dict] = []
    reset_sheets: list[str] = []

    # Reset the background of every data row in each validated sheet so stale
    # highlights from a previous run disappear once the data is fixed.
    for sheet in ALL_SHEETS:
        if is_excluded(sheet) or sheet not in sheet_ids:
            continue
        reset_sheets.append(sheet)
        requests.append(
            {
                "updateCells": {
                    "range": {"sheetId": sheet_ids[sheet], "startRowIndex": 1},
                    "fields": "userEnteredFormat.backgroundColor",
                }
            }
        )

    row_count = 0
    cell_count = 0
    for sheet, rows in ISSUE_CELLS.items():
        sheet_id = sheet_ids.get(sheet)
        if sheet_id is None or is_excluded(sheet):
            continue
        for row, cols in sorted(rows.items()):
            row_count += 1
            requests.append(
                {
                    "repeatCell": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": row - 1,
                            "endRowIndex": row,
                        },
                        "cell": {"userEnteredFormat": {"backgroundColor": HIGHLIGHT_ROW_COLOR}},
                        "fields": "userEnteredFormat.backgroundColor",
                    }
                }
            )
            for col in sorted(cols):
                cell_count += 1
                requests.append(
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": sheet_id,
                                "startRowIndex": row - 1,
                                "endRowIndex": row,
                                "startColumnIndex": col,
                                "endColumnIndex": col + 1,
                            },
                            "cell": {"userEnteredFormat": {"backgroundColor": HIGHLIGHT_CELL_COLOR}},
                            "fields": "userEnteredFormat.backgroundColor",
                        }
                    }
                )

    if not requests:
        tui.note("Nothing to highlight.", indent=2)
        return

    try:
        _batch_update(cache.spreadsheet, requests)
    except gspread.exceptions.APIError as exc:
        tui.line("fail", f"Could not write highlights: {exc}")
        tui.note(f"Give the service account '{options.service_account_email}' Editor access to the sheet.")
        return

    tui.line(
        "pass",
        f"Cleared old highlights in {tui.plural(len(reset_sheets), 'sheet')}; painted "
        f"{tui.plural(row_count, 'row')} yellow and {tui.plural(cell_count, 'cell')} red.",
    )
