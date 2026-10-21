"""Command line entry point: `uv run --directory etl python -m sheets.validate`."""

import sys

import gspread

from common import tui
from common.env import SPREADSHEET_ID, require
from common.google import get_credentials, safe_api_call
from common.tui import console
from sheets.rules import ALL_SHEETS

from . import options
from .cell_checks import check_all_tables_format, check_chips_and_dropdowns, check_invisible_characters
from .highlights import apply_highlights
from .options import is_excluded
from .phases import PHASES, PhaseResult
from .relation_checks import (
    check_completeness,
    check_engagement_flags,
    check_references,
    check_service_coverage,
    check_uniqueness,
)
from .sheet_cache import SheetCache


# -- Main ---------------------------------------------------------------------
def parse_excluded_sheets(argv: list[str]) -> set[str]:
    """Read --exclude a,b,c (or --exclude=a,b,c) into a set of sheet names."""
    raw: list[str] = []
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg == "--exclude":
            if i + 1 >= len(argv) or argv[i + 1].startswith("--"):
                console.print("[error][ERROR][/error] --exclude needs a comma-separated list of sheet names.")
                sys.exit(2)
            raw.append(argv[i + 1])
            i += 2
            continue
        if arg.startswith("--exclude="):
            raw.append(arg.split("=", 1)[1])
        i += 1

    names = {n.strip().lower() for chunk in raw for n in chunk.split(",") if n.strip()}
    unknown = sorted(names - set(ALL_SHEETS))
    if unknown:
        console.print(
            f"[error][ERROR][/error] Unknown sheet(s) in --exclude: {', '.join(unknown)}.\n"
            f"        Known sheets: {', '.join(ALL_SHEETS)}"
        )
        sys.exit(2)
    return names


def parse_limit(argv: list[str]) -> int:
    """Read --limit N (or --limit=N): rows shown per detail table."""
    for i, arg in enumerate(argv):
        value = None
        if arg == "--limit" and i + 1 < len(argv):
            value = argv[i + 1]
        elif arg.startswith("--limit="):
            value = arg.split("=", 1)[1]
        if value is not None:
            if not value.isdigit() or int(value) < 1:
                console.print("[error][ERROR][/error] --limit needs a whole number of at least 1.")
                sys.exit(2)
            return int(value)
    return options.detail_limit


def print_summary(results: list[PhaseResult]) -> int:
    """Phase-by-phase summary and the verdict panel. Returns the exit code."""
    tui.section("Summary")
    ran = {r.label: r for r in results}
    rows = []
    for label, name in PHASES:
        r = ran.get(label)
        if r is None:
            rows.append((label, name, "skip", "[muted]not run[/muted]"))
        else:
            rows.append((label, name, r.status, r.detail))
    tui.summary(rows)

    errors = sum(r.errors for r in results)
    warnings = sum(r.warnings for r in results)
    stopped = len(results) < len(PHASES)
    counts = f"{tui.plural(errors, 'error')}, {tui.plural(warnings, 'warning')}"

    next_steps: list[str] = []
    if any(r.fixable and (r.errors or r.warnings) for r in results):
        next_steps.append(
            "[bold]uv run --directory etl python -m sheets.cleanup[/bold] fixes formats, invisible characters, chips, "
            "dropdowns and case mismatches it can resolve on its own. Re-run sheets.validate after."
        )
    if errors and not options.highlight:
        next_steps.append("[bold]--highlight[/bold] colours the failing rows and cells in the sheet.")
    if stopped:
        next_steps.append("[bold]--force[/bold] runs every phase instead of stopping at the first failure.")

    if errors:
        failed = results[-1].label if stopped else None
        headline = f"FAILED · {counts}" + (f" · stopped after {failed}" if failed else "")
        tui.verdict("fail", headline, next_steps)
        return 1
    if warnings:
        tui.verdict("warn", f"PASSED with {tui.plural(warnings, 'warning')}", next_steps)
        return 0
    tui.verdict("pass", "PASSED · every check is clean", [])
    return 0


def main() -> None:
    force_mode = "--force" in sys.argv
    options.highlight = "--highlight" in sys.argv
    options.detail_limit = parse_limit(sys.argv)
    options.EXCLUDED_SHEETS.update(parse_excluded_sheets(sys.argv))

    require("SPREADSHEET_ID", "GOOGLE_SA_FILE")
    try:
        # Highlighting writes cell formatting, which the read-only scope does not allow.
        credentials = get_credentials(write=options.highlight)
    except (ValueError, FileNotFoundError) as exc:
        console.print(f"[error][ERROR][/error] {exc}")
        sys.exit(1)
    options.service_account_email = credentials.service_account_email
    gc = gspread.authorize(credentials)

    try:
        with console.status("Connecting to Google Sheets ...", spinner_style="info"):
            spreadsheet = safe_api_call(lambda: gc.open_by_key(SPREADSHEET_ID))
    except gspread.exceptions.APIError as exc:
        console.print(
            f"[error][ERROR][/error] Could not open spreadsheet.\n"
            f"        Make sure the service account '{options.service_account_email}'\n"
            f"        has been added to the sheet.\n"
            f"        API error: {exc}"
        )
        sys.exit(1)

    flags = []
    if force_mode:
        flags.append("--force (every phase runs)")
    if options.EXCLUDED_SHEETS:
        flags.append(f"--exclude {','.join(sorted(options.EXCLUDED_SHEETS))} (results are partial)")
    header_rows = [
        ("Spreadsheet", f"[bold]{spreadsheet.title}[/bold]"),
        ("Mode", "[warning]writes highlights into the sheet[/warning]" if options.highlight else "read-only"),
    ]
    if flags:
        header_rows.append(("Options", "\n".join(flags)))
    tui.header("validate", header_rows)

    cache = SheetCache(spreadsheet)
    cache.preload([t for t in ALL_SHEETS if not is_excluded(t)])

    checks = [
        check_all_tables_format,
        check_invisible_characters,
        check_chips_and_dropdowns,
        check_uniqueness,
        check_references,
        check_completeness,
        check_engagement_flags,
        check_service_coverage,
    ]
    results: list[PhaseResult] = []
    for check in checks:
        result = check(cache)
        results.append(result)
        if result.errors and not force_mode:
            break

    apply_highlights(cache)
    sys.exit(print_summary(results))


def run() -> None:
    """main() with the top-level handling for Ctrl-C."""
    # Force UTF-8 output on Windows
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped.[/warning]")
        sys.exit(130)
