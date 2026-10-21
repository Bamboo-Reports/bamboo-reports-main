"""Command line entry point: `uv run --directory etl python -m sheets.cleanup`."""

import argparse
import csv
import sys

from gspread.utils import rowcol_to_a1
from rich.prompt import Confirm

from common import tui
from common.env import SPREADSHEET_ID, require
from common.google import get_gspread_client, safe_api_call
from common.tui import console
from sheets.rules import ALL_SHEETS

from .columns import COLUMN_LEFTOVERS, step_columns
from .formats import step_formats
from .links import LINK_LEFTOVERS, step_links
from .lists import step_lists
from .references import step_references
from .text import step_artifacts, step_chips, step_invisible, step_whitespace
from .workbook import Change, Workbook

# -- Runner -------------------------------------------------------------------
STEPS = [
    ("columns", step_columns),
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
    "columns": "Unnamed columns with data deleted, unless a formula reads from them.",
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
        prog="python -m sheets.cleanup",
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
    if not LINK_LEFTOVERS and not wb.skipped_formulas and not COLUMN_LEFTOVERS:
        return
    tui.section("Needs a person")
    if COLUMN_LEFTOVERS:
        tui.line(
            "warn",
            f"{tui.plural(len(COLUMN_LEFTOVERS), 'unnamed column')} kept: formulas read from them. "
            "Name the column, or point the formulas elsewhere and run again.",
        )
        kept = tui.table("Sheet", "Column", "Cells#", "Read by~")
        for sheet, letter, filled, readers in COLUMN_LEFTOVERS:
            kept.add_row(sheet, letter, tui.num(filled), tui.clip("; ".join(readers), 70))
        tui.print_table(kept)
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


def confirm_write(what: str, title: str, assume_yes: bool) -> bool:
    """Ask before writing. --yes skips the question; without a terminal to
    ask on, --yes is required."""
    if assume_yes:
        return True
    if not sys.stdin.isatty():
        tui.line("fail", "Not writing: no terminal to confirm on. Pass --yes to write without asking.")
        return False
    console.print()
    return Confirm.ask(
        f"  Change [bold]{what}[/bold] in [bold]{title}[/bold]?",
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

    require("SPREADSHEET_ID", "GOOGLE_SA_FILE")
    try:
        # Write scope: cleanup edits the spreadsheet (validate is read-only).
        gc = get_gspread_client(write=True)
    except (ValueError, FileNotFoundError) as exc:
        console.print(f"[error][ERROR][/error] {exc}")
        sys.exit(1)
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
    touched = len({(ch.sheet, ch.row, ch.col) for ch in wb.changes if ch.step != "columns"})
    dropped = sum(len(cols) for cols in wb.dropped_columns.values())
    # "3 cells and 1 column": a deleted column is not counted as a cell.
    what = " and ".join(
        part
        for part in (
            tui.plural(touched, "cell") if touched or not dropped else "",
            tui.plural(dropped, "column") if dropped else "",
        )
        if part
    )
    rows = []
    for number, (name, _) in enumerate(steps, start=1):
        n = sum(1 for ch in wb.changes if ch.step == name)
        rows.append(
            (str(number), name, "info" if n else "pass", tui.plural(n, "change") if n else "[muted]clean[/muted]")
        )
    tui.summary(rows)
    if args.report:
        write_report(args.report, wb.changes, wb.skipped_formulas)

    needs_person = len(LINK_LEFTOVERS) + len(wb.skipped_formulas) + len(COLUMN_LEFTOVERS)
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
            f"Dry run · {what} would change",
            [
                "[bold]--apply[/bold] writes these changes (you are asked to confirm first).",
                *([] if args.report else ["[bold]--report changes.csv[/bold] saves every change for review."]),
                *review_step,
            ],
        )
        return

    if not confirm_write(what, spreadsheet.title, args.yes):
        tui.verdict("warn", "Nothing written", ["Re-run with [bold]--apply[/bold] when ready."])
        return

    written = wb.write()
    tui.verdict(
        "pass",
        f"Wrote {tui.plural(sum(written.values()), 'cell')} to {tui.plural(len(written), 'sheet')}"
        + (f", deleted {tui.plural(dropped, 'column')}" if dropped else ""),
        ["[bold]uv run --directory etl python -m sheets.validate[/bold] shows what is left to fix by hand.", *review_step],
    )


def run() -> None:
    """main() with the top-level handling for Ctrl-C."""
    # Force UTF-8 output on Windows
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except KeyboardInterrupt:
        console.print()
        console.print("[warning]Stopped. Nothing more will be written.[/warning]")
        sys.exit(130)
