"""Cell-level phases: format (0), invisible characters (0B), chips and
dropdowns (0C), look-alike letters (0D)."""

import gspread

from common import tui
from common.google import safe_api_call
from sheets import cell_meta
from sheets.rules import (
    ALL_SHEETS,
    INVISIBLE_CHARS,
    INVISIBLE_CHARS_RE,
    describe_lookalike,
    find_lookalikes,
    mark_lookalikes,
)

from . import options
from .highlights import record_issue
from .options import is_excluded
from .phases import PhaseResult, problem_kind
from .sheet_cache import SheetCache
from .table_format import check_columns, check_schema_tables, check_table_format


def check_all_tables_format(cache: SheetCache) -> PhaseResult:
    tui.section("Phase 0 · Format")
    result = PhaseResult("Phase 0", "Format", fixable=True)

    overview = tui.table("Sheet", "Rows#", "Issues#", "")
    issues: list[tuple[str, int, str, str]] = []
    checked_rows = 0
    for table_name in [t for t in ALL_SHEETS if not is_excluded(t)]:
        errors = check_table_format(cache, table_name)
        if errors is None:
            result.errors += 1
            overview.add_row(table_name, "-", "-", f"{tui.ICONS['fail']} not found or empty")
            continue
        errors = check_columns(cache, table_name) + errors
        rows = len(cache.get_data(table_name)[1])
        checked_rows += rows
        issues.extend((table_name, r, c, m) for r, c, m in errors)
        overview.add_row(
            table_name,
            tui.num(rows),
            tui.num(len(errors)) if errors else "[muted]0[/muted]",
            tui.ICONS["fail" if errors else "pass"],
        )
    tui.print_table(overview)
    issues.extend(check_schema_tables())

    result.errors += len(issues)
    if not issues:
        result.detail = f"{tui.num(checked_rows)} rows checked"
        return result

    sheets_hit = len({i[0] for i in issues})
    result.detail = f"{tui.plural(len(issues), 'issue')} in {tui.plural(sheets_hit, 'sheet')}"

    # With many issues, a breakdown says more than the first few rows do.
    if len(issues) > options.detail_limit:
        counts: dict[tuple[str, str, str], int] = {}
        for sheet, _row, column, message in issues:
            key = (sheet, column, problem_kind(message))
            counts[key] = counts.get(key, 0) + 1
        breakdown = tui.table("Sheet", "Column", "Problem", "Cells#", title="Most common")
        top = sorted(counts.items(), key=lambda kv: -kv[1])
        tui.capped(breakdown, [(s, c, p, tui.num(n)) for (s, c, p), n in top], options.detail_limit, "kind")

    details = tui.table("Sheet", "Row#", "Column", "Problem~", title="Issues")
    rows = [(s, r, c, tui.clip(m, 80)) for s, r, c, m in issues]
    tui.capped(details, rows, options.detail_limit, "issue")
    return result


# -- Phase 0B: Invisible Characters --------------------------------------------


def check_invisible_characters(cache: SheetCache) -> PhaseResult:
    """Flag cells containing zero-width or other invisible characters."""
    tui.section("Phase 0B · Invisible characters")
    result = PhaseResult("Phase 0B", "Invisible characters", fixable=True)

    offenders: list[tuple[str, int, str, str, str]] = []
    for table in [t for t in ALL_SHEETS if not is_excluded(t)]:
        try:
            headers, rows = cache.get_data(table)
        except gspread.exceptions.WorksheetNotFound:
            tui.line("skip", f"'{table}' not found, skipped.")
            continue

        for row_idx, row in enumerate(rows, start=2):
            for col_idx, value in enumerate(row):
                hits = INVISIBLE_CHARS_RE.findall(str(value))
                if not hits:
                    continue
                column = headers[col_idx] if col_idx < len(headers) else f"col {col_idx + 1}"
                kinds = ", ".join(sorted({INVISIBLE_CHARS[h] for h in hits}))
                # Make the invisible characters visible in the report.
                preview = tui.clip(INVISIBLE_CHARS_RE.sub("<?>", str(value)), 50)
                offenders.append((table, row_idx, column, kinds, preview))
                record_issue(table, row_idx, col_idx)

    if not offenders:
        tui.line("pass", "No invisible characters.")
        result.detail = "none found"
        return result

    result.errors = len(offenders)
    result.detail = f"{tui.plural(len(offenders), 'cell')}"
    tui.line("fail", f"{tui.plural(len(offenders), 'cell')} contain invisible characters.")
    details = tui.table("Sheet", "Row#", "Column", "Character(s)", "Value (shown as <?>)~")
    tui.capped(details, offenders, options.detail_limit, "cell")
    return result


# -- Phase 0C: Chips and dropdowns ----------------------------------------------


def header_name(headers: list[str], col_idx: int) -> str:
    return headers[col_idx] if col_idx < len(headers) else f"col {col_idx + 1}"


def check_chips_and_dropdowns(cache: SheetCache) -> PhaseResult:
    """
    Every cell must be plain text: no smart chips, no dropdowns. A chip shows
    the right text but is not text, so lookups (VLOOKUP, MATCH) skip it; a
    dropdown restricts entry and can wrap values in chips. Neither is visible
    in the values the other phases read, so this reads cell metadata, one
    extra API call per sheet.
    """
    tui.section("Phase 0C · Chips and dropdowns")
    result = PhaseResult("Phase 0C", "Chips and dropdowns", fixable=True)

    chip_findings: list[tuple[str, int, str, str, str]] = []
    dropdown_findings: list[tuple[str, int, str, str, str]] = []
    sheets = [t for t in ALL_SHEETS if not is_excluded(t)]
    with tui.loading(len(sheets), "Reading cell metadata") as bar:
        for sheet in sheets:
            bar.start(f"Reading chips and dropdowns in '{sheet}'")
            try:
                meta = safe_api_call(lambda: cell_meta.fetch(cache.spreadsheet, sheet))
                headers, rows = cache.get_data(sheet)
            except gspread.exceptions.WorksheetNotFound:
                bar.done()
                continue
            for chip in meta.chips:
                column = header_name(headers, chip.col)
                chip_findings.append((sheet, chip.row, column, f"{chip.kind} chip", tui.clip(chip.text, 50)))
                record_issue(sheet, chip.row, chip.col)
            for dropdown in meta.dropdowns:
                column = header_name(headers, dropdown.col)
                data_row = rows[dropdown.row - 2] if dropdown.row - 2 < len(rows) else []
                value = data_row[dropdown.col] if dropdown.col < len(data_row) else ""
                dropdown_findings.append((sheet, dropdown.row, column, "dropdown", tui.clip(str(value), 50)))
                record_issue(sheet, dropdown.row, dropdown.col)
            bar.done()

    # Chips first: they are the few cells that break lookups, while
    # dropdowns tend to cover whole columns and would push them out of view.
    findings = chip_findings + dropdown_findings
    if not findings:
        tui.line("pass", "Every cell is plain text: no chips, no dropdowns.")
        result.detail = "none found"
        return result

    result.errors = len(findings)
    parts = []
    if chip_findings:
        parts.append(tui.plural(len(chip_findings), "chip"))
    if dropdown_findings:
        parts.append(tui.plural(len(dropdown_findings), "dropdown cell"))
    result.detail = ", ".join(parts)
    tui.line("fail", f"{result.detail}. sheets.cleanup turns chips into text and removes dropdowns.")

    # Dropdowns usually cover a whole column, so the per-column count is the
    # useful view; the cell list follows for chips.
    counts: dict[tuple[str, str, str], int] = {}
    for sheet, _row, col, kind, _text in findings:
        counts[(sheet, col, kind)] = counts.get((sheet, col, kind), 0) + 1
    overview = tui.table("Sheet", "Column", "Kind", "Cells#")
    for (sheet, col, kind), n in sorted(counts.items(), key=lambda kv: -kv[1]):
        overview.add_row(sheet, col, kind, tui.num(n))
    tui.print_table(overview)

    details = tui.table("Sheet", "Row#", "Column", "Kind", "Shows~", title="Cells")
    tui.capped(details, findings, options.detail_limit, "cell")
    return result


# -- Phase 0D: Look-alike letters -----------------------------------------------


def check_lookalike_letters(cache: SheetCache) -> PhaseResult:
    """Flag Cyrillic or Greek letters that look Latin inside Latin words
    ("Ѕuchismita" with a Cyrillic Ѕ). They pass every other check but sort,
    search and join as a different character (#284). Words written wholly
    in another alphabet are left alone."""
    tui.section("Phase 0D · Look-alike letters")
    result = PhaseResult("Phase 0D", "Look-alike letters", fixable=True)

    offenders: list[tuple[str, int, str, str, str]] = []
    for table in [t for t in ALL_SHEETS if not is_excluded(t)]:
        try:
            headers, rows = cache.get_data(table)
        except gspread.exceptions.WorksheetNotFound:
            tui.line("skip", f"'{table}' not found, skipped.")
            continue

        for row_idx, row in enumerate(rows, start=2):
            for col_idx, value in enumerate(row):
                hits = find_lookalikes(str(value))
                if not hits:
                    continue
                kinds = ", ".join(describe_lookalike(ch) for ch in sorted(set(hits)))
                # Mark each look-alike so the report shows where it sits.
                preview = tui.clip(mark_lookalikes(str(value)), 50)
                offenders.append((table, row_idx, header_name(headers, col_idx), kinds, preview))
                record_issue(table, row_idx, col_idx)

    if not offenders:
        tui.line("pass", "No look-alike letters from other alphabets.")
        result.detail = "none found"
        return result

    result.errors = len(offenders)
    result.detail = f"{tui.plural(len(offenders), 'cell')}"
    tui.line("fail", f"{tui.plural(len(offenders), 'cell')} mix Latin with look-alike Cyrillic or Greek letters.")
    details = tui.table("Sheet", "Row#", "Column", "Character(s)", "Value (marked <x>)~")
    tui.capped(details, offenders, options.detail_limit, "cell")
    return result
