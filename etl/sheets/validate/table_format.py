"""Phase 0 for one sheet: every column against its format and value rules."""

import re
from datetime import datetime

from sheets.rules import ALL_RULES, EMAIL_PATTERN, URL_LINE_PATTERN

from .highlights import record_issue
from .sheet_cache import SheetCache


# -- Phase 0: Table Format Validation -----------------------------------------
def check_table_format(cache: SheetCache, table_name: str) -> list[tuple[int, str, str]] | None:
    """(row, column, message) for every format issue in one sheet, or None
    when the sheet is missing or empty."""
    rules_map = ALL_RULES.get(table_name, {})
    if not rules_map:
        return []

    try:
        headers, rows = cache.get_data(table_name)
    except Exception:
        return None

    if not headers:
        return None

    col_indices = {h.strip().lower(): i for i, h in enumerate(headers)}

    errors = []

    id_patterns = {
        "accounts": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "ticker": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "alias": (re.compile(r"^BR\d+$"), "BR followed by digits (for example, BR64)"),
        "centers": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "services": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "functions": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "tech": (re.compile(r"^CN\d+$"), "CN followed by digits (for example, CN3)"),
        "prospects": (re.compile(r"^CD-\d+$"), "CD- followed by digits (for example, CD-4393)"),
    }
    url_pattern = re.compile(r"https?://|www\.")

    for row_idx, row in enumerate(rows, start=2):
        for col_name, rule in rules_map.items():
            idx = col_indices.get(col_name.lower())
            val = row[idx].strip() if idx is not None and idx < len(row) else ""

            if val == "#N/A":
                val = ""

            is_nullable = rule.get("Can Be Nullable", "Yes").lower() == "yes"
            # A column can be conditionally nullable: for example a source
            # link may be blank when its source type is "Others".
            nullable_when = rule.get("Nullable When")
            if nullable_when and not val:
                other_idx = col_indices.get(nullable_when["column"].lower())
                other_val = row[other_idx].strip() if other_idx is not None and other_idx < len(row) else ""
                if other_val == nullable_when["equals"]:
                    is_nullable = True
            can_have_url = rule.get("Can Have URL", "Yes").lower() == "yes"
            desc = rule.get("Description", "")

            if not val:
                if not is_nullable:
                    errors.append((row_idx, col_name, "Cannot be null/empty"))
                continue

            if not can_have_url:
                if url_pattern.search(val):
                    errors.append((row_idx, col_name, f"Cannot contain URL: {val}"))

            # Descriptions are hand-written and carry stray double spaces, so
            # collapse runs of whitespace before matching. Without this the
            # center_country_iso2 rule ("should  be IN") never fired.
            desc_lower = re.sub(r"\s+", " ", desc).strip().lower()

            if col_name == "uuid" or "uuid" in desc_lower:
                pattern, expected_format = id_patterns.get(
                    table_name,
                    (re.compile(r"^.+$"), "a non-empty identifier"),
                )
                if not pattern.match(val):
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"Invalid identifier, expected {expected_format}: {val}",
                        )
                    )

            elif "date in this exact format" in desc_lower:
                if not re.match(r"^[1-9]\d?-[A-Za-z]+-\d{4}$", val):
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"Invalid date format (expected D-FullMonth-YYYY): {val}",
                        )
                    )
                else:
                    try:
                        parsed_date = datetime.strptime(val, "%d-%B-%Y")
                        canonical_date = f"{parsed_date.day}-{parsed_date.strftime('%B-%Y')}"
                        if canonical_date != val:
                            raise ValueError
                    except ValueError:
                        errors.append(
                            (
                                row_idx,
                                col_name,
                                f"Invalid date; use a real date with the full month name (example: 7-August-2025): {val}",
                            )
                        )

            elif "||" in desc:
                allowed = [x.strip() for x in desc.split("||")[1:] if x.strip()]
                if val not in allowed:
                    errors.append(
                        (row_idx, col_name, f"Must be one of {allowed}: {val}")
                    )

            elif "linkedin" in desc_lower:
                if "linkedin.com" not in val.lower():
                    errors.append(
                        (row_idx, col_name, f"Must be linkedin.com format: {val}")
                    )

            elif "valid url" in desc_lower or desc_lower == "should be url":
                # One URL per line: a scheme or www. or a bare domain, and no
                # whitespace inside the line (two URLs pasted with a space
                # between them is the common failure).
                for line in val.split("\n"):
                    line = line.strip()
                    if line and not URL_LINE_PATTERN.match(line):
                        errors.append((row_idx, col_name, f"Not a URL: {line}"))

            elif "string or number" in desc_lower and "15 characters" in desc_lower:
                clean_val = val.replace(",", "")
                is_number = clean_val.isdigit() or re.match(
                    r"^\d+(\.\d+)?$", clean_val
                )
                if not is_number and len(val) > 15:
                    errors.append(
                        (
                            row_idx,
                            col_name,
                            f"String value must not exceed 15 characters: {val}",
                        )
                    )

            # Rank caps come before the generic number check: these columns are
            # described as "only number", so keying the caps off the description
            # alone meant the number branch always won and the bounds never ran.
            elif col_name.endswith("forbes_2000_rank") or "2000 rank" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or int(clean_val) > 2000:
                    errors.append((row_idx, col_name, f"Must be number <= 2000: {val}"))

            elif col_name.endswith("fortune_500_rank") or "500 rank" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or int(clean_val) > 500:
                    errors.append((row_idx, col_name, f"Must be number <= 500: {val}"))

            elif "only number" in desc_lower or desc_lower == "number":
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() and not re.match(
                    r"^\d+(\.\d+)?$", clean_val
                ):
                    errors.append((row_idx, col_name, f"Must be a number: {val}"))

            elif "valid year" in desc_lower:
                clean_val = val.replace(",", "")
                if not clean_val.isdigit() or len(clean_val) > 4:
                    errors.append((row_idx, col_name, f"Must be valid year: {val}"))

            elif "no numbers" in desc_lower:
                if re.search(r"\d", val):
                    errors.append((row_idx, col_name, f"Cannot contain numbers: {val}"))

            elif "valid pincode" in desc_lower or "6 digit" in desc_lower:
                if not re.match(r"^\d{6}$", val):
                    errors.append(
                        (row_idx, col_name, f"Must be 6 digit pincode: {val}")
                    )

            elif "10 digit phone" in desc_lower:
                if not re.match(r"^\d{10}$", val):
                    errors.append((row_idx, col_name, f"Must be a 10 digit phone number: {val}"))

            elif "iso code should be in" in desc_lower:
                if val != "IN":
                    errors.append((row_idx, col_name, f"ISO code must be IN: {val}"))

            elif "valid email" in desc_lower:
                # Practical email regex: local part (letters, digits, . _ % + -),
                # a domain with at least one dot, and a 2+ letter TLD. Rejects
                # spaces, missing @, trailing dot, and single-label domains.
                if not EMAIL_PATTERN.match(val):
                    errors.append((row_idx, col_name, f"Invalid email: {val}"))

            elif "valid lat" in desc_lower or "valid longitude" in desc_lower:
                try:
                    float(val)
                except ValueError:
                    errors.append(
                        (row_idx, col_name, f"Must be valid coordinate: {val}")
                    )

    for r_idx, c_name, _msg in errors:
        record_issue(table_name, r_idx, c_name, headers)
    return errors


def column_letter(idx: int) -> str:
    """0-based column index to its sheet letter: 0 -> A, 26 -> AA."""
    letters = ""
    idx += 1
    while idx:
        idx, rem = divmod(idx - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def check_columns(cache: SheetCache, table_name: str) -> list[tuple[int, str, str]]:
    """(row, column, message) for header-row problems in one sheet: data under
    a blank header, named columns no rule covers, duplicated headers, and rule
    columns missing from the sheet. The import drops unnamed and unknown
    columns silently, so they are only caught here."""
    rules_map = ALL_RULES.get(table_name, {})
    try:
        headers, rows = cache.get_data(table_name)
    except Exception:
        return []
    if not headers or not rules_map:
        return []

    expected = {name.strip().lower() for name in rules_map}
    issues: list[tuple[int, str, str]] = []
    seen: set[str] = set()
    for idx, header in enumerate(headers):
        letter = column_letter(idx)
        if not header:
            filled = sum(1 for row in rows if idx < len(row) and str(row[idx]).strip())
            if filled:
                issues.append(
                    (1, f"{letter} (no header)", f"No header, {filled:,} cells filled; not imported, etl/cleanup.sh deletes it")
                )
        elif header in seen:
            issues.append((1, f"{letter} ({header})", "Duplicate header: the name is used by an earlier column"))
        elif header not in expected:
            issues.append((1, f"{letter} ({header})", "Unknown column: not imported; delete it or add it to the schema"))
        seen.add(header)
    for name in sorted(expected - seen):
        issues.append((1, name, "Missing column: not in the sheet"))
    return issues
