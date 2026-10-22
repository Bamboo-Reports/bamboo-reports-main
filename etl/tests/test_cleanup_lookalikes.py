"""The cleanup lookalikes step (#284) on an in-memory stand-in workbook."""

from sheets.cleanup.text import step_lookalikes


class FakeWorkbook:
    """Just the parts of Workbook the step uses: editable, cells and set."""

    def __init__(self, sheets: dict[str, list[list[str]]]):
        self.sheets = sheets
        self.editable = list(sheets)
        self.changes: list[tuple[str, str, int, int, str, str]] = []

    def cells(self, sheet):
        for r, row in enumerate(self.sheets[sheet]):
            for c, value in enumerate(row):
                if value:
                    yield r, c, value

    def set(self, step, sheet, row_idx, col_idx, value, note=""):
        self.changes.append((step, sheet, row_idx, col_idx, value, note))


def test_rewrites_only_cells_with_look_alikes_in_latin_words():
    wb = FakeWorkbook(
        {
            "prospects": [
                ["Ѕuchismita Pradhan", "Head of π research"],
                ["Plain Name", "Москва"],
            ]
        }
    )

    step_lookalikes(wb)

    assert wb.changes == [
        ("lookalikes", "prospects", 0, 0, "Suchismita Pradhan", "Cyrillic Capital Letter Dze (U+0405) for 'S'"),
    ]
