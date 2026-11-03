"""
Which spreadsheet the sheet tools (validate, cleanup) work on.

The default is the main sheet: SPREADSHEET_ID, our tab names, our headers.
--source NAME picks a profile from etl/sources/NAME.toml instead, for a
spreadsheet laid out differently, such as the data team's sheet that rows
are copied from into the main sheet. A profile names the tab behind each of
our sheets and the header behind each of our columns.

Every check and step keeps using our names ("accounts",
"account_hq_city"). This module turns them into the profile's tab names,
and the profile's headers into our column names, as the sheets are read.
"""

import os
import re
import tomllib
from dataclasses import dataclass, field

from common.env import ETL_DIR, SPREADSHEET_ID
from sheets.rules import ALL_SHEETS, INVISIBLE_CHARS_RE

SOURCES_DIR = ETL_DIR / "sources"


def normalise_header(header: str) -> str:
    """Case, invisible characters and runs of whitespace (line breaks too)
    ignored, so "Source Link\\n(HQ Offering)" matches "source link (hq offering)"."""
    return re.sub(r"\s+", " ", INVISIBLE_CHARS_RE.sub("", str(header))).strip().lower()


@dataclass
class SheetMap:
    """One of our sheets in a profile."""

    tab: str
    # Our column -> their header, normalised. Columns their sheet does not
    # have are left out.
    columns: dict[str, str]
    # Our column -> their header as written in the profile, for messages.
    labels: dict[str, str]
    # Their headers we do not copy, normalised.
    ignore: set[str] = field(default_factory=set)
    # Our column -> {their value: our value}, for columns where the two
    # sheets use different words (their "Non GCC" is our "exclude").
    values: dict[str, dict[str, str]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.to_ours = {theirs: ours for ours, theirs in self.columns.items()}
        self.to_theirs = {column: {v: k for k, v in mapping.items()} for column, mapping in self.values.items()}


@dataclass
class Source:
    name: str
    title: str
    spreadsheet_id: str | None
    # The variable in etl/.env that holds spreadsheet_id.
    spreadsheet_env: str
    # None for the main sheet: every sheet, our names, our headers.
    sheets: dict[str, SheetMap] | None = None

    @property
    def is_main(self) -> bool:
        return self.sheets is None

    @property
    def sheet_names(self) -> list[str]:
        """Our sheets this source has, in the usual order."""
        if self.sheets is None:
            return list(ALL_SHEETS)
        return [s for s in ALL_SHEETS if s in self.sheets]

    def in_scope(self, sheet: str) -> bool:
        return sheet in self.sheet_names

    def tab(self, sheet: str) -> str | None:
        """The tab title behind one of our sheets, None if this source has none."""
        if self.sheets is None:
            return sheet
        mapped = self.sheets.get(sheet)
        return mapped.tab if mapped else None

    def sheet_for_tab(self, tab: str) -> str | None:
        """The reverse of tab(), for formulas that name a tab."""
        for sheet in self.sheet_names:
            if (self.tab(sheet) or "").lower() == tab.strip().lower():
                return sheet
        return None

    def our_headers(self, sheet: str, headers: list[str]) -> list[str]:
        """Their header row as our column names. The main sheet's headers are
        returned as given. A header the profile does not map keeps its
        normalised name, so it never collides with one of ours by accident."""
        if self.sheets is None:
            return headers
        mapped = self.sheets[sheet]
        return [mapped.to_ours.get(normalise_header(h), normalise_header(h)) for h in headers]

    def translate_rows(self, sheet: str, headers: list[str], rows: list[list[str]]) -> None:
        """Their values as ours, in place, for the columns the profile
        translates. headers are ours (from our_headers()). A value the
        profile does not list is left as it is, so the rules still see it."""
        mapped = self.sheets.get(sheet) if self.sheets else None
        if not mapped or not mapped.values:
            return
        for column, mapping in mapped.values.items():
            if column not in headers:
                continue
            c = headers.index(column)
            for row in rows:
                if c < len(row):
                    ours = mapping.get(str(row[c]).strip())
                    if ours is not None:
                        row[c] = ours

    def their_value(self, sheet: str, column: str, value: str) -> str:
        """The reverse of translate_rows() for one cell, so a write back to
        their sheet keeps their words."""
        mapped = self.sheets.get(sheet) if self.sheets else None
        if not mapped:
            return value
        return mapped.to_theirs.get(column, {}).get(value, value)

    def has_column(self, sheet: str, column: str) -> bool:
        """False for our columns this source does not have, which are not checked."""
        if self.sheets is None:
            return True
        mapped = self.sheets.get(sheet)
        return bool(mapped and column in mapped.columns)

    @property
    def flag(self) -> str:
        """The command line flag that picks this source, for next-step hints."""
        return "" if self.is_main else f" --source {self.name}"


MAIN = Source(name="main", title="Main sheet", spreadsheet_id=SPREADSHEET_ID, spreadsheet_env="SPREADSHEET_ID")

# The source this run works on. The CLIs call select() before reading anything.
active: Source = MAIN


def available() -> list[str]:
    return sorted(p.stem for p in SOURCES_DIR.glob("*.toml"))


def load(name: str) -> Source:
    """Read etl/sources/NAME.toml. Raises ValueError with a readable message
    when the file is missing or malformed."""
    if name == "main":
        return MAIN
    path = SOURCES_DIR / f"{name}.toml"
    if not path.exists():
        known = ", ".join(["main", *available()])
        raise ValueError(f"No source '{name}'. Known: {known} (profiles live in etl/sources/).")
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except tomllib.TOMLDecodeError as exc:
        raise ValueError(f"{path.name} is not valid TOML: {exc}") from exc

    env_name = data.get("spreadsheet_env", "")
    if not env_name:
        raise ValueError(f"{path.name}: set spreadsheet_env to the etl/.env variable holding the spreadsheet ID.")

    sheets: dict[str, SheetMap] = {}
    for sheet, spec in data.items():
        if not isinstance(spec, dict):
            continue
        if sheet not in ALL_SHEETS:
            raise ValueError(f"{path.name}: [{sheet}] is not one of our sheets ({', '.join(ALL_SHEETS)}).")
        if not spec.get("tab"):
            raise ValueError(f"{path.name}: [{sheet}] needs tab = \"<their tab name>\".")
        raw = spec.get("columns", {})
        columns = {ours: normalise_header(theirs) for ours, theirs in raw.items() if str(theirs).strip()}
        seen: dict[str, str] = {}
        for ours, theirs in columns.items():
            if theirs in seen:
                raise ValueError(
                    f"{path.name}: [{sheet}] maps both {seen[theirs]} and {ours} to \"{raw[ours]}\"."
                )
            seen[theirs] = ours
        values = {column: {str(k).strip(): str(v) for k, v in m.items()} for column, m in spec.get("values", {}).items()}
        for column, mapping in values.items():
            if column not in columns:
                raise ValueError(f"{path.name}: [{sheet}.values.{column}] is for a column that is not mapped.")
            ours = list(mapping.values())
            if len(set(ours)) != len(ours):
                raise ValueError(f"{path.name}: [{sheet}.values.{column}] turns two of their values into the same one.")
        sheets[sheet] = SheetMap(
            tab=str(spec["tab"]),
            columns=columns,
            labels={ours: str(theirs) for ours, theirs in raw.items() if str(theirs).strip()},
            ignore={normalise_header(h) for h in spec.get("ignore", [])},
            values=values,
        )
    if not sheets:
        raise ValueError(f"{path.name}: no sheets defined.")

    return Source(
        name=name,
        title=data.get("title", name),
        spreadsheet_id=os.getenv(env_name),
        spreadsheet_env=env_name,
        sheets=sheets,
    )


def select(name: str) -> Source:
    global active
    active = load(name)
    return active
