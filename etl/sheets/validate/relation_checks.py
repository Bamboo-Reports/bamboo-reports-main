"""Phases across rows and sheets: uniqueness (1), references (2),
completeness (2B), engagement flags (2C) and service coverage (3)."""

import sys

import gspread

from common import tui
from common.tui import console
from sheets.rules import COMPLETENESS_RULES, SERVICE_COVERAGE_RULES, UNIQUENESS_RULES, VALIDATION_RULES

from . import options
from .highlights import record_issue
from .options import is_excluded
from .phases import PhaseResult
from .sheet_cache import SheetCache

# -- Phase 1: Uniqueness -------------------------------------------------------


def get_combined_values(
    cache: SheetCache, sheet_name: str, columns: list[str]
) -> list[tuple[int, str]]:
    """
    (row, combined value) for a key made of several columns, values joined
    with ' | ' and lowercased. Rows where every column is blank are skipped.
    """
    headers, rows = cache.get_data(sheet_name)
    missing = [c for c in columns if c.lower() not in headers]
    if missing:
        console.print(
            f"[error][ERROR][/error] Column(s) {', '.join(missing)} not found in sheet '{sheet_name}'."
        )
        sys.exit(1)
    indices = [headers.index(c.lower()) for c in columns]
    results: list[tuple[int, str]] = []
    for idx, row in enumerate(rows, start=2):
        parts = [str(row[i]).strip() if i < len(row) else "" for i in indices]
        if any(parts):
            results.append((idx, " | ".join(parts).lower()))
    return results


def check_uniqueness(cache: SheetCache) -> PhaseResult:
    """Check that primary key columns contain no duplicate values."""
    tui.section("Phase 1 · Uniqueness")
    result = PhaseResult("Phase 1", "Uniqueness")

    overview = tui.table("Sheet", "Key", "Values#", "Duplicates#", "")
    dup_rows: list[tuple[str, str, str, str]] = []

    for rule in UNIQUENESS_RULES:
        sheet_name = rule["sheet"]
        columns = rule.get("columns") or [rule["column"]]
        column = " + ".join(columns)
        if is_excluded(sheet_name):
            overview.add_row(sheet_name, column, "-", "-", f"{tui.ICONS['skip']} excluded")
            continue

        try:
            if len(columns) == 1:
                data = cache.get_column_values(sheet_name, column)
            else:
                data = get_combined_values(cache, sheet_name, columns)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(sheet_name, column, "-", "-", f"{tui.ICONS['warn']} not found")
            result.warnings += 1
            continue

        seen: dict[str, list[int]] = {}
        for row, val in data:
            seen.setdefault(val.strip(), []).append(row)
        duplicates = {val: rows for val, rows in seen.items() if len(rows) > 1}

        if duplicates:
            headers, _ = cache.get_data(sheet_name)
            for rows in duplicates.values():
                for row in rows:
                    for col in columns:
                        record_issue(sheet_name, row, col, headers)
            result.errors += len(duplicates)
            for val, rows in sorted(duplicates.items()):
                shown = ", ".join(str(r) for r in rows[:10])
                if len(rows) > 10:
                    shown += f" (+{len(rows) - 10} more)"
                dup_rows.append((sheet_name, column, tui.clip(val, 70), shown))

        overview.add_row(
            sheet_name,
            column,
            tui.num(len(data)),
            tui.num(len(duplicates)) if duplicates else "[muted]0[/muted]",
            tui.ICONS["fail" if duplicates else "pass"],
        )

    tui.print_table(overview)
    if dup_rows:
        details = tui.table("Sheet", "Key", "Duplicate value~", "Rows", title="Duplicates")
        tui.capped(details, dup_rows, options.detail_limit, "duplicate")
        result.detail = tui.plural(result.errors, "duplicate value")
    else:
        result.detail = "every key unique"
    return result


# -- Phase 2: Referential Integrity --------------------------------------------


def check_references(cache: SheetCache) -> PhaseResult:
    """
    For every rule in VALIDATION_RULES, every value of the column in the
    target sheets must exist in the source sheet. A value that exists only
    with different casing is a warning (cleanup fixes it), a value that
    does not exist at all is an error.
    """
    tui.section("Phase 2 · References")
    result = PhaseResult("Phase 2", "References", fixable=True)

    overview = tui.table("Key", "Source → Sheet", "Values#", "Missing#", "Case#", "")
    missing_rows: list[tuple[str, int, str, str, str]] = []
    case_rows: list[tuple[str, int, str, str, str]] = []

    for rule in VALIDATION_RULES:
        source_sheet, column = rule["source_sheet"], rule["column"]
        if is_excluded(source_sheet):
            overview.add_row(column, f"{source_sheet} (excluded)", "-", "-", "-", tui.ICONS["skip"])
            continue
        try:
            source_data = cache.get_column_values(source_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(column, f"{source_sheet} (not found)", "-", "-", "-", tui.ICONS["fail"])
            result.errors += 1
            continue

        source_canonical: dict[str, str] = {}
        for _, val in source_data:
            source_canonical.setdefault(val.lower(), val)

        for sheet_name in [t for t in rule["target_sheets"] if not is_excluded(t)]:
            try:
                sheet_data = cache.get_column_values(sheet_name, column)
            except gspread.exceptions.WorksheetNotFound:
                overview.add_row(column, f"{source_sheet} → {sheet_name}", "-", "-", "-", f"{tui.ICONS['warn']} not found")
                result.warnings += 1
                continue

            missing = 0
            case = 0
            target_headers, _ = cache.get_data(sheet_name)
            for row, val in sheet_data:
                expected = source_canonical.get(val.lower())
                if expected is None:
                    missing += 1
                    missing_rows.append((sheet_name, row, column, tui.clip(val, 60), source_sheet))
                    record_issue(sheet_name, row, column, target_headers)
                elif val != expected:
                    case += 1
                    case_rows.append((sheet_name, row, column, tui.clip(val, 45), tui.clip(expected, 45)))

            result.errors += missing
            result.warnings += case
            overview.add_row(
                column,
                f"{source_sheet} → {sheet_name}",
                tui.num(len(sheet_data)),
                tui.num(missing) if missing else "[muted]0[/muted]",
                tui.num(case) if case else "[muted]0[/muted]",
                tui.ICONS[tui.status_of(missing, case)],
            )

    tui.print_table(overview)
    if missing_rows:
        details = tui.table("Sheet", "Row#", "Column", "Value~", "Not found in", title="Missing from the source sheet")
        tui.capped(details, missing_rows, options.detail_limit, "row")
    if case_rows:
        details = tui.table("Sheet", "Row#", "Column", "Value~", "Source spells it~", title="Case mismatches")
        tui.capped(details, case_rows, options.detail_limit, "row")

    parts = []
    if result.errors:
        parts.append(tui.plural(result.errors, "missing value"))
    if result.warnings:
        parts.append(tui.plural(result.warnings, "case mismatch", "case mismatches"))
    result.detail = ", ".join(parts) or f"{len(VALIDATION_RULES)} rules, all match"
    return result


def check_completeness(cache: SheetCache) -> PhaseResult:
    """Check that every source value appears at least once in the target sheet."""
    tui.section("Phase 2B · Completeness")
    result = PhaseResult("Phase 2B", "Completeness")

    overview = tui.table("Source", "Target", "Values#", "Missing#", "")
    missing_rows: list[tuple[str, int, str, str]] = []

    for rule in COMPLETENESS_RULES:
        source_sheet, target_sheet, column = rule["source_sheet"], rule["target_sheet"], rule["column"]
        if is_excluded(source_sheet) or is_excluded(target_sheet):
            overview.add_row(source_sheet, target_sheet, "-", "-", f"{tui.ICONS['skip']} excluded")
            continue
        try:
            source_data = cache.get_column_values(source_sheet, column)
            target_data = cache.get_column_values(target_sheet, column)
        except gspread.exceptions.WorksheetNotFound:
            overview.add_row(source_sheet, target_sheet, "-", "-", f"{tui.ICONS['fail']} not found")
            result.errors += 1
            continue

        target_values = {val.lower() for _, val in target_data}
        missing = [(row, val) for row, val in source_data if val.lower() not in target_values]
        if missing:
            source_headers, _ = cache.get_data(source_sheet)
            for row, val in missing:
                record_issue(source_sheet, row, column, source_headers)
                missing_rows.append((source_sheet, row, tui.clip(val, 60), target_sheet))
        result.errors += len(missing)
        overview.add_row(
            source_sheet,
            target_sheet,
            tui.num(len(source_data)),
            tui.num(len(missing)) if missing else "[muted]0[/muted]",
            tui.ICONS["fail" if missing else "pass"],
        )

    tui.print_table(overview)
    if missing_rows:
        details = tui.table("Sheet", "Row#", "Value~", "Missing from", title="Not present in the target sheet")
        tui.capped(details, missing_rows, options.detail_limit, "row")
        result.detail = tui.plural(result.errors, "missing row")
    else:
        result.detail = "every account in alias and ticker"
    return result


# -- Phase 2C: Engagement flags ------------------------------------------------


def check_engagement_flags(cache: SheetCache) -> PhaseResult:
    """
    prospects.prospect_engaged should be 'Yes' exactly when the prospect's
    email has a row in subscribers. The app's Engaged filter reads the flag
    while the activity timeline reads subscribers, so a mismatch shows a
    prospect as not engaged with a timeline, or engaged with none.

    Warning only: mismatches never fail the run.
    """
    tui.section("Phase 2C · Engagement flags")
    result = PhaseResult("Phase 2C", "Engagement flags")

    if is_excluded("prospects") or is_excluded("subscribers"):
        tui.line("skip", "prospects or subscribers excluded via --exclude.")
        result.detail = "skipped"
        return result

    try:
        engaged_emails = {val.lower() for _, val in cache.get_column_values("subscribers", "prospect_email")}
        headers, rows = cache.get_data("prospects")
    except gspread.exceptions.WorksheetNotFound:
        tui.line("warn", "prospects or subscribers not found, skipped.")
        result.warnings = 1
        result.detail = "sheet not found"
        return result

    email_idx = headers.index("prospect_email") if "prospect_email" in headers else -1
    flag_idx = headers.index("prospect_engaged") if "prospect_engaged" in headers else -1
    if email_idx < 0 or flag_idx < 0:
        tui.line("warn", "prospects lacks prospect_email or prospect_engaged, skipped.")
        result.warnings = 1
        result.detail = "column not found"
        return result

    mismatches: list[tuple[int, str, str, str]] = []
    for row_num, row in enumerate(rows, start=2):
        email = str(row[email_idx]).strip() if email_idx < len(row) else ""
        flag = str(row[flag_idx]).strip() if flag_idx < len(row) else ""
        if not email:
            continue
        expected = "Yes" if email.lower() in engaged_emails else "No"
        if flag.lower() != expected.lower():
            mismatches.append((row_num, email, flag or "(blank)", expected))
            record_issue("prospects", row_num, "prospect_engaged", headers)

    if not mismatches:
        tui.line("pass", "Every prospect_engaged flag matches subscribers.")
        result.detail = "all flags match"
        return result

    result.warnings = len(mismatches)
    result.detail = tui.plural(len(mismatches), "prospect row")
    tui.line("warn", f"{tui.plural(len(mismatches), 'prospect row')} disagree with subscribers.")
    details = tui.table("Row#", "prospect_email", "prospect_engaged", "Expected")
    tui.capped(details, mismatches, options.detail_limit, "row")
    return result


# -- Phase 3: Service Coverage -------------------------------------------------


def check_service_coverage(cache: SheetCache) -> PhaseResult:
    """
    For each row in the services sheet, verify that at least one
    service column is filled in (non-empty).
    """
    tui.section("Phase 3 · Service coverage")
    result = PhaseResult("Phase 3", "Service coverage")

    for rule in SERVICE_COVERAGE_RULES:
        sheet_name = rule["sheet"]
        label_col = rule["label_column"]
        service_cols = rule["service_columns"]

        if is_excluded(sheet_name):
            tui.line("skip", f"'{sheet_name}' excluded via --exclude.")
            result.detail = "skipped"
            continue

        try:
            headers, rows = cache.get_data(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            tui.line("fail", f"'{sheet_name}' not found.")
            result.errors += 1
            continue

        col_indices = {
            name: headers.index(name.strip().lower())
            for name in service_cols + [label_col]
            if name.strip().lower() in headers
        }
        label_idx = col_indices.get(label_col)
        service_idxs = [col_indices[c] for c in service_cols if c in col_indices]
        if not service_idxs:
            tui.line("fail", f"No service columns found in '{sheet_name}'.")
            result.errors += 1
            continue

        empty_rows: list[tuple[int, str]] = []
        total_data_rows = 0
        for i, row in enumerate(rows, start=2):
            label = row[label_idx].strip() if label_idx is not None and label_idx < len(row) else ""
            if not label:
                continue
            total_data_rows += 1
            if not any(idx < len(row) and row[idx].strip() for idx in service_idxs):
                empty_rows.append((i, label))

        with_service = total_data_rows - len(empty_rows)
        coverage = (with_service / total_data_rows * 100) if total_data_rows else 0
        result.detail = f"{coverage:.1f}% of {tui.num(total_data_rows)} rows"

        if not empty_rows:
            tui.line("pass", f"All {tui.num(total_data_rows)} '{sheet_name}' rows have a service.")
            continue

        result.errors += len(empty_rows)
        for row_num, _label in empty_rows:
            for idx in service_idxs:
                record_issue(sheet_name, row_num, idx)
        tui.line(
            "fail",
            f"{tui.plural(len(empty_rows), 'row')} of {tui.num(total_data_rows)} have no service "
            f"({coverage:.1f}% coverage).",
        )
        details = tui.table("Row#", label_col)
        tui.capped(details, empty_rows, options.detail_limit, "row")

    return result
