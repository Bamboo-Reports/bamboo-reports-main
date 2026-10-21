"""Step 1: unnamed columns. A column with data but no header is never
imported (the import drops it), so it is leftover work in the sheet, like
the VLOOKUP helper column that sat in prospects column H. It is deleted,
unless a formula still reads from it."""

import re

from sheets.rules import ALL_SHEETS

from .workbook import Workbook

# Unnamed columns a formula reads from: (sheet, column letter, filled cells,
# a few of the formulas). Kept, and listed for a person to look at.
COLUMN_LEFTOVERS: list[tuple[str, str, int, list[str]]] = []

# An A1 reference such as H5, $H$5, H:H, G2:J9, prospects!H2 or 'my sheet'!H:H.
# Only a letter run followed by a row number or a ':' counts, so function
# names (SUM, VLOOKUP) are not taken for columns. Text inside a formula's
# quotes can still match; that only keeps a column, never deletes one.
A1_REF = re.compile(
    r"(?:(?:'(?P<quoted>[^']+)'|(?P<sheet>[A-Za-z0-9_]+))!)?"
    r"(?<![A-Za-z0-9_.])\$?(?P<c1>[A-Z]{1,3})(?:\$?(?P<r1>\d+))?"
    r"(?::\$?(?P<c2>[A-Z]{1,3})\$?\d*)?"
)


def column_letter(idx: int) -> str:
    """0-based column index to its sheet letter: 0 -> A, 26 -> AA."""
    letters = ""
    idx += 1
    while idx:
        idx, rem = divmod(idx - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def column_index(letters: str) -> int:
    """Sheet letter to 0-based column index: A -> 0, AA -> 26."""
    idx = 0
    for ch in letters:
        idx = idx * 26 + ord(ch) - 64
    return idx - 1


def formulas_reading(wb: Workbook, sheet: str, col_idx: int) -> list[str]:
    """Formulas in any loaded sheet that read from this column."""
    found = []
    for other, formulas in wb.formula_text.items():
        for (_, c), formula in formulas.items():
            if other == sheet and c == col_idx:
                continue  # the column's own cells go with it
            for m in A1_REF.finditer(formula):
                if m.group("r1") is None and m.group("c2") is None:
                    continue
                target = m.group("quoted") or m.group("sheet") or other
                if target.strip().lower() != sheet.lower():
                    continue
                start = column_index(m.group("c1"))
                end = column_index(m.group("c2")) if m.group("c2") else start
                if min(start, end) <= col_idx <= max(start, end):
                    found.append(f"{other}: {formula}")
                    break
    return found


def step_columns(wb: Workbook) -> None:
    # Every sheet the tool knows is read, so a formula in any of them that
    # reads from a column keeps it. Tabs outside that list are not checked.
    for sheet in ALL_SHEETS:
        wb.load(sheet)
    for sheet in wb.editable:
        rows = wb.rows(sheet)
        width = max((len(r) for r in rows), default=0)
        for c in range(width):
            if wb.header(sheet, c):
                continue
            filled = [row[c] for row in rows if c < len(row) and row[c].strip()]
            if not filled:
                continue
            letter = column_letter(c)
            readers = formulas_reading(wb, sheet, c)
            if readers:
                COLUMN_LEFTOVERS.append((sheet, letter, len(filled), readers[:3]))
                continue
            wb.drop_column("columns", sheet, c, len(filled), filled[0], letter)
