"""Step 10: child-sheet keys rewritten to the parent sheet's exact spelling."""

from common import tui
from sheets.rules import VALIDATION_RULES

from .formats import DASHES_RE
from .workbook import FIRST_DATA_ROW, Workbook

# -- Step 10: references across sheets -----------------------------------------
# Sheets that carry cn_unique_key. When a key is renamed in 'centers', the
# same rename is applied to every one of these.
KEY_SHEETS = ["centers", "services", "functions", "tech"]

QUOTE_FOLD = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
                            "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"'})


def fold(value: str) -> str:
    """Matching key: ignores case, curly versus straight quotes, dash style."""
    return DASHES_RE.sub("-", value.translate(QUOTE_FOLD)).casefold()


def canonical_spellings(wb: Workbook, sheet: str, column: str) -> dict[str, str]:
    """Folded value -> exact spelling in the source sheet. First occurrence
    wins, matching validate. Warns when the source itself is inconsistent."""
    canonical: dict[str, str] = {}
    conflicts: dict[str, set[str]] = {}
    for _, _, value in wb.column_cells(sheet, column):
        val = value.strip()
        key = fold(val)
        canonical.setdefault(key, val)
        if canonical[key] != val:
            conflicts.setdefault(key, {canonical[key]}).add(val)
    if conflicts:
        tui.line(
            "warn",
            f"'{sheet}' spells {tui.plural(len(conflicts), column + ' value')} more than one way. "
            f"The first spelling wins; fix '{sheet}' by hand if that is wrong:",
        )
        for key, spellings in sorted(conflicts.items()):
            tui.note(f"{' / '.join(sorted(spellings))}  →  keeps '{canonical[key]}'", indent=6)
    return canonical


def plan_key_renames(wb: Workbook) -> dict[str, str]:
    """
    cn_unique_key is account name + center name + type + focus + city +
    sequence number. If a key starts with the row's account name only when
    case and quotes are ignored, rebuild it with the current name as the
    prefix. Returns {old_key: new_key}.
    """
    key_idx = wb.col("centers", "cn_unique_key")
    name_idx = wb.col("centers", "account_global_legal_name")
    if key_idx < 0 or name_idx < 0:
        return {}
    rows = wb.rows("centers")
    existing = {wb.get("centers", r, key_idx).strip() for r in range(len(rows))}
    renames: dict[str, str] = {}
    for r in range(len(rows)):
        old_key = wb.get("centers", r, key_idx).strip()
        name = wb.get("centers", r, name_idx).strip()
        if not old_key or not name or old_key.startswith(name):
            continue
        if not fold(old_key).startswith(fold(name)):
            continue  # key not built from this name at all
        new_key = name + old_key[len(name):]
        if new_key in existing:
            tui.line(
                "fail",
                f"centers row {r + FIRST_DATA_ROW}: renaming '{old_key}' would duplicate "
                f"'{new_key}'. Fix by hand.",
            )
            continue
        renames[old_key] = new_key
    return renames


def step_references(wb: Workbook) -> None:
    for rule in VALIDATION_RULES:
        source, column = rule["source_sheet"], rule["column"]
        if wb.col(source, column) < 0:
            tui.line("warn", f"No '{column}' in '{source}', rule skipped.")
            continue
        canonical = canonical_spellings(wb, source, column)
        for target in rule["target_sheets"]:
            if target not in wb.editable:
                continue
            for r, c, value in wb.column_cells(target, column):
                expected = canonical.get(fold(value.strip()))
                # Missing entirely is a real mismatch, not a spelling issue.
                if expected is not None:
                    wb.set("references", target, r, c, expected, f"matches {source}")

    renames = plan_key_renames(wb)
    if not renames:
        return
    blocked = [s for s in KEY_SHEETS if s not in wb.editable]
    if blocked:
        tui.line(
            "warn",
            f"{tui.plural(len(renames), 'cn_unique_key rename')} skipped: they must change every key "
            f"sheet at once, and {', '.join(blocked)} is excluded by --sheets.",
        )
        return
    for sheet in KEY_SHEETS:
        for r, c, value in wb.column_cells(sheet, "cn_unique_key"):
            new_key = renames.get(value.strip())
            if new_key is not None:
                wb.set("references", sheet, r, c, new_key, "key prefix rebuilt")
