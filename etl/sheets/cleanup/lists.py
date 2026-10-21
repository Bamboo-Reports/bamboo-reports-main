"""Step 6: free-text list columns, one item per line."""

import re

from .links import LEADING_BULLET
from .workbook import Workbook

# -- Step 6: list text columns ------------------------------------------------
LIST_COLUMNS = {
    "services": [
        "primary_service",
        "focus_region",
        "service_it",
        "service_ai",
        "service_erd",
        "service_fna",
        "service_hr",
        "service_procurement",
        "service_sales_marketing",
        "service_customer_support",
        "service_others",
    ],
    "accounts": ["account_hq_key_offerings"],
}
# Sheets where ' - ' joins two separate items. In accounts it joins a product
# to its description ('AgentOS - AI Agents Platform'), so it is kept there.
SPLIT_ON_HYPHEN = {"services"}
# Sheets whose list items are short labels that should read in title case.
# Key offerings are product descriptions written as sentences, so their
# casing is left as typed.
FIX_CASE = {"services"}

INLINE_SEPARATOR_FULL = re.compile(r"\s+[-•]\s+")
INLINE_SEPARATOR_BULLET_ONLY = re.compile(r"\s+•\s+")
LOWERCASE_WORD = re.compile(r"^[^A-Za-z]*[a-z][^A-Z]*$")
SMALL_WORDS = {
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of",
    "on", "or", "per", "the", "to", "via", "vs", "with",
}

# Region names that appear in focus_region. Used only to split lines where
# two regions were typed on one line without a separator. Multi-word names
# are listed so 'North America' is not split into 'North' and 'America'.
KNOWN_REGIONS = [
    "Global", "India", "APAC", "EMEA", "North America", "SEA", "Europe", "MEA",
    "ANZ", "SAARC", "United States", "ASEAN", "LATM", "LATAM", "South Asia",
    "Africa", "Japan", "US", "USA", "Canada", "Asia", "Australia", "APJ",
    "Middle East", "United Kingdom", "Singapore", "America", "UK", "China",
    "Indian Subcontinent", "MENA", "Malaysia", "Sri Lanka", "Srilanka",
    "Bangladesh", "South Africa", "Germany", "UAE", "Latin America", "Nepal",
    "AMEA", "Bhutan", "Oceania", "South America", "France", "Spain", "ME",
    "South Korea", "Mexico", "IMEA", "Ireland", "West Asia", "Philippines",
    "Turkey", "Thailand", "New Zealand", "Indonesia", "Vietnam", "Netherlands",
    "Italy", "Brazil", "Sweden", "Switzerland", "Poland", "Israel", "Korea",
    "Hong Kong", "Taiwan", "Pakistan", "Egypt", "Saudi Arabia", "Nordics",
    "Benelux", "DACH", "Americas", "Asia Pacific", "Rest of World", "ROW",
]
_REGION_LOOKUP = {r.lower(): r for r in KNOWN_REGIONS}
_MAX_REGION_WORDS = max(len(r.split()) for r in KNOWN_REGIONS)


def fix_case(item: str) -> str:
    """Capitalise all-lowercase words; leave words with any capital alone."""
    out = []
    for i, w in enumerate(item.split(" ")):
        if LOWERCASE_WORD.match(w) and not (i > 0 and w.lower() in SMALL_WORDS):
            m = re.search(r"[a-z]", w)
            w = w[: m.start()] + w[m.start()].upper() + w[m.start() + 1 :]
        out.append(w)
    return " ".join(out)


def split_regions(line: str) -> list[str]:
    """Split 'India Global' into ['India', 'Global'] if every word is a
    known region name. Returns [line] unchanged otherwise."""
    words = line.split()
    if len(words) < 2:
        return [line]
    parts: list[str] = []
    i = 0
    while i < len(words):
        for n in range(min(_MAX_REGION_WORDS, len(words) - i), 0, -1):
            cand = " ".join(words[i : i + n])
            if cand.lower() in _REGION_LOOKUP:
                parts.append(_REGION_LOOKUP[cand.lower()])
                i += n
                break
        else:
            return [line]
    return parts if len(parts) > 1 else [line]


def normalise_list(value: str, column: str, sheet: str) -> str:
    separator = INLINE_SEPARATOR_FULL if sheet in SPLIT_ON_HYPHEN else INLINE_SEPARATOR_BULLET_ONLY
    items: list[str] = []
    for line in value.split("\n"):
        line = LEADING_BULLET.sub("", line.strip())
        for piece in separator.split(line):
            piece = LEADING_BULLET.sub("", piece.strip()).strip()
            piece = re.sub(r"\s*,\s*$", "", piece)
            piece = re.sub(r"\s{2,}", " ", piece)
            if not piece:
                continue
            pieces = split_regions(piece) if column == "focus_region" else [piece]
            for p in pieces:
                if sheet in FIX_CASE:
                    p = fix_case(p)
                if p not in items:
                    items.append(p)
    return "\n".join(items)


def step_lists(wb: Workbook) -> None:
    for sheet, columns in LIST_COLUMNS.items():
        if sheet not in wb.editable:
            continue
        for column in columns:
            for r, c, value in wb.column_cells(sheet, column):
                wb.set("lists", sheet, r, c, normalise_list(value, column, sheet))
