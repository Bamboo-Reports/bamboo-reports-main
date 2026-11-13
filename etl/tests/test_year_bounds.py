"""Year bounds in the format phase: a first centre year of 0 once made years in India 2026."""

from datetime import datetime

from sheets.validate.table_format import EARLIEST_YEAR, MAX_YEARS_IN_INDIA, YEARS_AHEAD, check_table_format


class FakeCache:
    """Just enough of SheetCache for the format phase."""

    def __init__(self, headers: list[str], rows: list[list[str]]):
        self.headers = headers
        self.rows = rows

    def get_data(self, sheet_name: str):
        return self.headers, self.rows


def errors_for(column: str, values: list[str]) -> list[str]:
    cache = FakeCache([column], [[value] for value in values])
    found = check_table_format(cache, "accounts") or []
    return [message for _, col, message in found if col == column]


def test_years_in_india_rejects_a_whole_year():
    assert errors_for("years_in_india", ["2026"]) == [f"Must be a number of years, at most {MAX_YEARS_IN_INDIA}: 2026"]


def test_years_in_india_accepts_real_values_and_blanks():
    assert errors_for("years_in_india", ["1", "45", "76", str(MAX_YEARS_IN_INDIA), ""]) == []


def test_first_centre_year_rejects_zero():
    latest = datetime.now().year + YEARS_AHEAD
    assert errors_for("account_first_center_year", ["0"]) == [f"Must be a year from {EARLIEST_YEAR} to {latest}: 0"]


def test_first_centre_year_accepts_past_and_announced_years():
    latest = datetime.now().year + YEARS_AHEAD
    assert errors_for("account_first_center_year", ["1913", "2026", "2030", str(latest)]) == []


def test_first_centre_year_rejects_years_out_of_range():
    latest = datetime.now().year + YEARS_AHEAD
    assert len(errors_for("account_first_center_year", ["1799", str(latest + 1), "20", "20255"])) == 4
