"""Steps 2 to 6: chips and dropdowns, spreadsheet artifacts, invisible
characters, look-alike letters and whitespace."""

import html
import re

from common import tui
from common.google import safe_api_call
from sheets import cell_meta
from sheets.rules import INVISIBLE_CHARS, INVISIBLE_CHARS_RE, describe_lookalike, find_lookalikes, replace_lookalikes

from .workbook import FIRST_DATA_ROW, Workbook


# -- Step 2: chips and dropdowns ----------------------------------------------
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


# -- Step 3: paste artifacts --------------------------------------------------
# HTML entities left behind by copying from a page's source ('64 &amp; 65').
# Only these few are decoded: a bare '&' followed by text is real data.
HTML_ENTITY_RE = re.compile(r"&(amp|nbsp|quot|apos|lt|gt|#\d{1,6}|#x[0-9a-fA-F]{1,5});")
# Spreadsheet error values typed or pasted as text. validate already
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


# -- Step 4: invisible characters ---------------------------------------------
def step_invisible(wb: Workbook) -> None:
    for sheet in wb.editable:
        for r, c, value in wb.cells(sheet):
            hits = INVISIBLE_CHARS_RE.findall(value)
            if hits:
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                wb.set("invisible", sheet, r, c, INVISIBLE_CHARS_RE.sub("", value), kinds)


# -- Step 5: look-alike letters -----------------------------------------------
def step_lookalikes(wb: Workbook) -> None:
    """Cyrillic or Greek letters that look Latin, inside Latin words, become
    the Latin letter ("Ѕuchismita" to "Suchismita"). Words written wholly in
    another alphabet are left alone. Shown in the preview like every step,
    so each swap can be reviewed before --apply. (validate 0D)"""
    for sheet in wb.editable:
        for r, c, value in wb.cells(sheet):
            hits = find_lookalikes(value)
            if hits:
                kinds = ", ".join(describe_lookalike(ch) for ch in sorted(set(hits)))
                wb.set("lookalikes", sheet, r, c, replace_lookalikes(value), kinds)


# -- Step 6: whitespace -------------------------------------------------------
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
