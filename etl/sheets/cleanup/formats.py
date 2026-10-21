"""Step 7: values with one obvious correct form (dates, months, years,
choices, ISO codes, emails, phones, names)."""

import re
from datetime import datetime

from sheets.rules import ALL_RULES

from .workbook import Workbook


def rule_desc(rule: dict) -> str:
    """Rule description, lowercased with runs of whitespace collapsed."""
    return re.sub(r"\s+", " ", rule.get("Description", "")).strip().lower()


# -- Step 7: formats ----------------------------------------------------------
MONTHS = [datetime(2000, m, 1).strftime("%B") for m in range(1, 13)]
MONTH_LOOKUP = {m.lower(): m for m in MONTHS} | {m[:3].lower(): m for m in MONTHS} | {"sept": "September"}

DATE_FORMATS = [
    "%d-%B-%Y", "%d-%b-%Y", "%d-%B-%y", "%d-%b-%y",
    "%d %B %Y", "%d %b %Y", "%d %B, %Y", "%d %b, %Y",
    "%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%b %d %Y",
    "%Y-%m-%d",
]

# Treated as the same character when matching a value to an allowed choice.
DASHES_RE = re.compile("[\u2010-\u2015\u2212]")


def fix_date(value: str) -> str | None:
    """'06-May-25' -> '6-May-2025'. None if it is not a date we can read
    unambiguously. Slash dates (05/06/2025) are left alone: day and month
    order cannot be told apart."""
    text = DASHES_RE.sub("-", value)
    text = re.sub(r"(?i)\bsept\b", "Sep", text)
    for fmt in DATE_FORMATS:
        try:
            d = datetime.strptime(text, fmt)
        except ValueError:
            continue
        fixed = f"{d.day}-{d.strftime('%B')}-{d.year}"
        return fixed if fixed != value else None
    return None


def fix_month(value: str) -> str | None:
    return MONTH_LOOKUP.get(value.strip().rstrip(".").lower())


def fix_year(value: str) -> str | None:
    """'2015.0' or '2,015' -> '2015'."""
    m = re.match(r"^(\d),?(\d{3})(\.0+)?$", value)
    return m.group(1) + m.group(2) if m else None


def choice_key(value: str) -> str:
    return re.sub(r"\s+", "", DASHES_RE.sub("-", value)).lower()


def choice_map(allowed: list[str]) -> dict[str, str]:
    """Loose key -> exact allowed value. Keys shared by two allowed values
    are dropped: there is no single right answer for them."""
    by_key: dict[str, list[str]] = {}
    for a in allowed:
        by_key.setdefault(choice_key(a), []).append(a)
    return {k: v[0] for k, v in by_key.items() if len(v) == 1}


# Cyrillic and Greek letters that look exactly like Latin ones. An email
# containing one ('ѕuchismita@...', with a Cyrillic s) fails validation and
# never matches the real address. Built from code points so the table stays
# readable: each pair is (lookalike, Latin letter).
LOOKALIKES = str.maketrans({
    chr(cp): latin
    for cp, latin in [
        (0x0430, "a"), (0x0435, "e"), (0x043E, "o"), (0x0440, "p"), (0x0441, "c"),
        (0x0443, "y"), (0x0445, "x"), (0x0455, "s"), (0x0456, "i"), (0x0458, "j"),
        (0x0501, "d"), (0x04BB, "h"), (0x04CF, "l"),
        (0x0410, "A"), (0x0412, "B"), (0x0415, "E"), (0x041A, "K"), (0x041C, "M"),
        (0x041D, "H"), (0x041E, "O"), (0x0420, "P"), (0x0421, "C"), (0x0422, "T"),
        (0x0425, "X"), (0x0405, "S"), (0x0406, "I"), (0x0408, "J"),
        (0x03BF, "o"), (0x03B1, "a"), (0x03BD, "v"), (0x03C1, "p"), (0x03B9, "i"),
        (0x039F, "O"), (0x0391, "A"), (0x0392, "B"), (0x0395, "E"), (0x039A, "K"),
        (0x039C, "M"), (0x039D, "N"), (0x03A4, "T"), (0x03A7, "X"),
    ]
})


def fix_email(value: str) -> str | None:
    text = re.sub(r"(?i)^mailto:", "", value.strip()).strip("<>").strip()
    text = text.translate(LOOKALIKES)
    if "@" not in text:
        return None
    local, _, domain = text.rpartition("@")
    return f"{local}@{domain.lower().rstrip('.')}"


def fix_phone(value: str) -> str | None:
    """'+91 98765 43210', '098765-43210', '9876543210.0' -> '9876543210'.
    Anything that does not come out as exactly 10 digits (two numbers in one
    cell, a landline with area code) is left for validate to report."""
    digits = re.sub(r"\D", "", re.sub(r"\.0+$", "", value.strip()))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


# Person-name columns. Typed in ALL CAPS or all lowercase, they get each word
# capitalised: 'SANDEEP KUMAR' -> 'Sandeep Kumar', "annie d'souza" ->
# "Annie D'Souza". Names with any mixed case are left as typed, so McDonald
# and deSouza survive.
NAME_COLUMNS = {
    "prospects": ["prospect_full_name", "prospect_first_name", "prospect_last_name"],
}
NAME_WORD = re.compile(r"[^\W\d_]+")


def fix_name(value: str) -> str | None:
    if re.search(r"[\d@/]", value) or not NAME_WORD.search(value):
        return None
    if value != value.upper() and value != value.lower():
        return None

    def word(m: re.Match) -> str:
        w = m.group(0)
        # Up to three letters with no vowel are initials: 'bc' -> 'BC'.
        if len(w) <= 3 and not re.search(r"[aeiouy]", w, re.IGNORECASE):
            return w.upper()
        return w.capitalize()

    fixed = NAME_WORD.sub(word, value.lower())
    return fixed if fixed != value else None


def step_formats(wb: Workbook) -> None:
    for sheet in wb.editable:
        for column, rule in ALL_RULES.get(sheet, {}).items():
            desc = rule_desc(rule)
            raw_desc = rule.get("Description", "")
            fixer = None
            note = ""
            # Same precedence as check_table_format in sheets/validate: the date
            # rule's description also contains '||', so it is tested first.
            if "date in this exact format" in desc:
                fixer, note = fix_date, "date"
            elif "||" in raw_desc:
                allowed = [x.strip() for x in raw_desc.split("||")[1:] if x.strip()]
                lookup = choice_map(allowed)
                exact = set(allowed)

                def fixer(v, lookup=lookup, exact=exact):
                    return None if v in exact else lookup.get(choice_key(v))

                note = "allowed value"
            elif "valid month" in desc:
                fixer, note = fix_month, "month"
            elif "valid year" in desc:
                fixer, note = fix_year, "year"
            elif "iso code should be in" in desc:
                fixer, note = (lambda v: "IN" if v.lower() in ("in", "ind", "india") else None), "ISO code"
            elif "valid email" in desc:
                fixer, note = fix_email, "email"
            elif "10 digit phone" in desc:
                fixer, note = fix_phone, "phone"
            if fixer is None:
                continue
            for r, c, value in wb.column_cells(sheet, column):
                fixed = fixer(value)
                if fixed is not None:
                    wb.set("formats", sheet, r, c, fixed, note)

        for column in NAME_COLUMNS.get(sheet, []):
            for r, c, value in wb.column_cells(sheet, column):
                fixed = fix_name(value)
                if fixed is not None:
                    wb.set("formats", sheet, r, c, fixed, "name casing")
