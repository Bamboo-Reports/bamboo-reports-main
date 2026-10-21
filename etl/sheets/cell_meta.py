"""
cell_meta.py
------------
Finds smart chips and dropdowns in a worksheet, for validate (Phase 0C)
and cleanup (the chips step).

Neither shows up in get_all_values(): a chip comes back as its display text
and a dropdown is not part of the value at all. Both still matter. A chip
holding an email looks like the email but is not text, so VLOOKUP and MATCH
miss it (prospects rows 52341 and 61272 lost their engaged flag this way).
A dropdown limits what can be typed and turns values into chips of its own.
So this reads the cell metadata instead, one API call per worksheet.
"""

from dataclasses import dataclass, field

import gspread

# Data validation types that render as a dropdown. Other rules (checkbox,
# number ranges, custom formulas) are not flagged.
DROPDOWN_TYPES = {"ONE_OF_LIST", "ONE_OF_RANGE"}


@dataclass
class Chip:
    row: int  # 1-based sheet row
    col: int  # 0-based column index
    kind: str  # 'person', 'link' or 'chip'
    text: str  # plain text that should replace the chip


@dataclass
class Dropdown:
    row: int  # 1-based sheet row
    col: int  # 0-based column index
    kind: str  # data validation type, such as ONE_OF_LIST


@dataclass
class CellMeta:
    sheet_id: int
    chips: list[Chip] = field(default_factory=list)
    dropdowns: list[Dropdown] = field(default_factory=list)


def chip_text(cell: dict) -> tuple[str, str] | None:
    """(kind, plain text) for a cell that holds a smart chip, else None.

    A people chip's text is the email. A link chip whose run covers the
    whole cell becomes its URL, since the display text is only the page
    title. Anything else keeps the text the cell shows."""
    runs = [r for r in cell.get("chipRuns", []) if r.get("chip")]
    if not runs:
        return None
    shown = cell.get("formattedValue", "")
    chip = runs[0]["chip"]
    if "personProperties" in chip:
        return "person", shown or chip["personProperties"].get("email", "")
    if "richLinkProperties" in chip:
        uri = chip["richLinkProperties"].get("uri", "")
        whole_cell = len(cell.get("chipRuns", [])) == 1
        return "link", uri if whole_cell and uri else shown
    return "chip", shown


def fetch(spreadsheet: gspread.Spreadsheet, sheet_name: str) -> CellMeta:
    """Every chip and dropdown in one worksheet. Raises
    gspread.exceptions.WorksheetNotFound like spreadsheet.worksheet()."""
    meta = spreadsheet.fetch_sheet_metadata(
        params={
            "ranges": f"'{sheet_name}'",
            "includeGridData": "true",
            "fields": (
                "sheets(properties(sheetId),"
                "data(startRow,startColumn,rowData(values(chipRuns,dataValidation,formattedValue))))"
            ),
        }
    )
    sheets = meta.get("sheets", [])
    if not sheets:
        raise gspread.exceptions.WorksheetNotFound(sheet_name)
    sheet = sheets[0]
    result = CellMeta(sheet_id=sheet["properties"]["sheetId"])
    for data in sheet.get("data", []):
        row0, col0 = data.get("startRow", 0), data.get("startColumn", 0)
        for i, row in enumerate(data.get("rowData", [])):
            sheet_row = row0 + i + 1
            # Row 1 is the header row. Its cells are not data.
            if sheet_row == 1:
                continue
            for j, cell in enumerate(row.get("values", [])):
                found = chip_text(cell)
                if found:
                    result.chips.append(Chip(sheet_row, col0 + j, *found))
                rule_type = cell.get("dataValidation", {}).get("condition", {}).get("type")
                if rule_type in DROPDOWN_TYPES:
                    result.dropdowns.append(Dropdown(sheet_row, col0 + j, rule_type))
    return result
