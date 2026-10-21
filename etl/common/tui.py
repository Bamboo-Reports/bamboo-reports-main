"""
tui.py
------
The shared terminal look for the ETL (the importer and the sheet tools,
validate and cleanup): one colour theme, status icons, a header panel,
section rules, compact tables, progress bars and the closing summary and
verdict. It only needs `rich`.
"""

import time
from contextlib import contextmanager
from typing import Iterator

from rich import box
from rich.console import Console, Group
from rich.padding import Padding
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

THEME = Theme(
    {
        "success": "bold #A8E6CF",  # pastel green
        "error": "bold #FF8B94",  # pastel red
        "warning": "bold #FFD3B6",  # pastel orange
        "info": "bold #A4C8F0",  # pastel blue
        "border": "bold #C8B6FF",  # pastel purple
        # Plain dim instead of a fixed light grey, so it stays readable on a
        # light terminal background too.
        "muted": "dim",
    }
)

# highlight=False: rich would otherwise colour every number and quoted
# string in a message, which competes with the status colours.
console = Console(theme=THEME, highlight=False)

ICONS = {
    "pass": "[success]✓[/success]",
    "warn": "[warning]![/warning]",
    "fail": "[error]✗[/error]",
    "skip": "[muted]-[/muted]",
    "info": "[info]›[/info]",
}
VERDICT_BORDER = {"pass": "#A8E6CF", "warn": "#FFD3B6", "fail": "#FF8B94"}


def num(n: int) -> str:
    """1234 -> '1,234'."""
    return f"{n:,}"


def plural(n: int, word: str, many: str | None = None) -> str:
    """plural(1, 'row') -> '1 row', plural(3, 'row') -> '3 rows'."""
    return f"{num(n)} {word if n == 1 else (many or word + 's')}"


def header(tool: str, rows: list[tuple[str, str]]) -> None:
    """The panel at the top of a run: what is being checked, and how."""
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="muted", no_wrap=True)
    grid.add_column()
    for key, value in rows:
        grid.add_row(key, value)
    console.print(
        Panel(
            grid,
            title=f"[border]Bamboo Reports · {tool}[/border]",
            title_align="left",
            border_style="#C8B6FF",
            box=box.ROUNDED,
            expand=False,
            padding=(0, 1),
        )
    )


def section(title: str) -> None:
    console.print()
    console.rule(f"[border]{title}[/border]", style="#C8B6FF", align="left")


def line(status: str, text: str, indent: int = 2) -> None:
    """One status line: '  ✓ text'."""
    console.print(" " * indent + f"{ICONS[status]} {text}")


def note(text: str, indent: int = 4) -> None:
    console.print(" " * indent + f"[muted]{text}[/muted]")


def table(*columns: str, title: str | None = None) -> Table:
    """A compact table. Column names ending in '#' are numbers: right
    aligned. Names ending in '~' are cell values: kept on one line and cut
    with an ellipsis when the terminal is narrow. The marker is dropped from
    the heading either way."""
    t = Table(
        box=box.SIMPLE_HEAD,
        header_style="info",
        show_edge=False,
        pad_edge=False,
        title=title,
        title_justify="left",
        title_style="bold",
    )
    # Indexes of the value columns, the only ones allowed to shrink.
    t.flexible = set()  # type: ignore[attr-defined]
    for name in columns:
        if name.endswith("~"):
            t.flexible.add(len(t.columns))  # type: ignore[attr-defined]
        if name.endswith("#"):
            t.add_column(name[:-1], justify="right")
        elif name.endswith("~"):
            # print_table() sizes these to the room the labels leave.
            t.add_column(name[:-1], no_wrap=True, overflow="ellipsis")
        else:
            t.add_column(name, no_wrap=True, overflow="ellipsis")
    return t


def print_table(t: Table, indent: int = 2) -> None:
    # Pin every label column to its widest cell so a narrow terminal shrinks
    # the value columns (cut with an ellipsis) instead of the sheet, cell and
    # column names, which are what you need to find the cell.
    flexible = getattr(t, "flexible", set())
    fixed_width = 0
    for i, column in enumerate(t.columns):
        if i in flexible:
            continue
        cells = [str(column.header), *(str(c) for c in column._cells)]
        column.min_width = max(Text.from_markup(c).cell_len for c in cells)
        fixed_width += column.min_width
    if flexible:
        # Between two columns: one space of padding each side plus the
        # (blank) divider of the SIMPLE_HEAD box.
        gaps = 3 * (len(t.columns) - 1)
        room = console.width - indent - gaps - fixed_width
        for i in flexible:
            t.columns[i].max_width = max(12, min(44, room // len(flexible)))
    # A titled table follows another table, so give it a line of air.
    top = 1 if t.title else 0
    console.print(Padding(t, (top, 0, 0, indent)))


def capped(t: Table, rows: list[tuple], limit: int, noun: str = "row") -> None:
    """Print a table with at most `limit` rows and say how many were cut."""
    for row in rows[:limit]:
        t.add_row(*[str(v) for v in row])
    print_table(t)
    if len(rows) > limit:
        note(f"... and {plural(len(rows) - limit, noun)} more. Raise --limit to see them.")


def clip(value: str, width: int = 60) -> str:
    """One-line preview of a cell: line breaks shown as ⏎, long text cut."""
    value = value.replace("\r", "").replace("\n", " ⏎ ")
    return value if len(value) <= width else value[: width - 1] + "…"


def status_of(errors: int, warnings: int = 0) -> str:
    return "fail" if errors else "warn" if warnings else "pass"


class Loader:
    """Handle yielded by loading(): name the current item, then tick it off."""

    def __init__(self, progress: Progress, task: int):
        self._progress = progress
        self._task = task

    def start(self, description: str) -> None:
        self._progress.update(self._task, description=description)

    def done(self) -> None:
        self._progress.advance(self._task)


def progress(counts: bool = True) -> Progress:
    """A progress display in the shared style. It clears itself when done,
    so the caller prints one summary line instead. counts=False drops the
    'n/total' column, for tasks whose size is not known up front."""
    columns = [
        SpinnerColumn(style="info"),
        TextColumn("{task.description}"),
        BarColumn(bar_width=24, complete_style="#C8B6FF", finished_style="#A8E6CF"),
    ]
    if counts:
        columns.append(MofNCompleteColumn())
    columns.append(TimeElapsedColumn())
    return Progress(*columns, console=console, transient=True)


@contextmanager
def loading(total: int, description: str) -> Iterator[Loader]:
    """A single progress bar for slow API work, ticked off item by item."""
    with progress() as progress_bar:
        task = progress_bar.add_task(description, total=total)
        yield Loader(progress_bar, task)


class Timer:
    def __init__(self) -> None:
        self.start = time.monotonic()

    def __str__(self) -> str:
        seconds = time.monotonic() - self.start
        return f"{seconds:.0f}s" if seconds < 90 else f"{seconds / 60:.1f} min"


def summary(rows: list[tuple[str, str, str, str]]) -> None:
    """Closing summary: (label, name, status, detail) per phase or step.
    The label can be empty when the steps have no numbering of their own."""
    grid = Table.grid(padding=(0, 2))
    grid.add_column(style="muted", no_wrap=True)
    grid.add_column(no_wrap=True)
    grid.add_column(no_wrap=True)
    grid.add_column()
    for label, name, status, detail in rows:
        grid.add_row(label, name, ICONS[status], detail)
    console.print(Padding(grid, (1, 0, 1, 2)))


def verdict(status: str, headline: str, next_steps: list[str]) -> None:
    """The last thing on screen: the outcome and what to do about it."""
    parts: list = [Text.from_markup(f"{ICONS[status]} [bold]{headline}[/bold]")]
    if next_steps:
        steps = Table.grid(padding=(0, 1))
        steps.add_column(style="muted")
        steps.add_column()
        for step in next_steps:
            steps.add_row("•", step)
        parts += [Text(""), Text.from_markup("[muted]Next[/muted]"), steps]
    console.print(
        Panel(
            Group(*parts),
            border_style=VERDICT_BORDER.get(status, "#C8B6FF"),
            box=box.ROUNDED,
            expand=False,
            padding=(0, 1),
            # Wide enough for a sentence, narrow enough to read on a big screen.
            width=min(console.width, 88),
        )
    )
