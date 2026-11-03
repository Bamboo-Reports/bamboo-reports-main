"""Typed-number formulas (cleanup step 'constants') and the sync's column plan."""

import pytest

from sheets import source
from sheets.cleanup.text import constant_value
from sheets.sync import build_rows, column_runs, convert, plan_columns, to_serial


@pytest.mark.parametrize(
    "formula, value",
    [("=+16142836500", 16142836500), ("=672/3", 224), ("= 2 * (3 + 1)", 8), ("=-5", -5), ("=7/2", 3.5)],
)
def test_typed_numbers_work_out(formula, value):
    assert constant_value(formula) == value


@pytest.mark.parametrize("formula", ["=A2+1", "=SUM(1,2)", "=VLOOKUP(H2,centers!D:AP,37,0)", "=1/0", "=", "text"])
def test_real_formulas_are_left_alone(formula):
    assert constant_value(formula) is None


def test_dates_typed_as_text_become_date_serials():
    assert to_serial("3-December-2024") == 45629  # what the main sheet stores for that date
    assert to_serial("21-May-2025") == 45798
    assert to_serial("14-Aug-2026") == to_serial("14-August-2026")
    assert to_serial("not a date") is None


@pytest.fixture
def data_team():
    previous = source.active
    source.select("data-team")
    yield source.active
    source.active = previous


def test_columns_are_copied_filled_kept_constant_or_left_blank(data_team):
    headers = ["uuid", "account_last_update_date", "account_hq_employee_count", "account_source", "account_hq_revenue_range", "lat_like"]
    values = [["BR2", 45629, 15000, "Bamboo Reports", "1Bn - 5Bn", "1.5"], ["BR3", 45798, 60500, "Bamboo Reports", "10Bn - 25Bn", "2.5"]]
    formulas = [["BR2", 45629, 15000, "Bamboo Reports", "=IFERROR(A)", "1.5"], ["BR3", 45798, 60500, "Bamboo Reports", "=IFERROR(B)", "2.5"]]
    plan = plan_columns("accounts", headers, values, formulas, skip=set())
    assert plan.kinds == {
        "uuid": "copy",
        "account_last_update_date": "copy",
        "account_hq_employee_count": "copy",
        "account_source": "constant",
        "account_hq_revenue_range": "formula",
        "lat_like": "blank",
    }
    assert "account_last_update_date" in plan.dates and "account_hq_employee_count" in plan.numeric
    assert convert("3-December-2024", "account_last_update_date", plan) == 45629
    assert convert("1,500", "account_hq_employee_count", plan) == 1500
    assert convert("about 10", "account_hq_employee_count", plan) == "about 10"  # left for validate to flag

    src_headers = ["uuid", "account_last_update_date", "account_hq_employee_count"]
    rows = build_rows(plan, src_headers, [["BR9", "1-May-2026", "2,000"]])
    assert rows == [["BR9", to_serial("1-May-2026"), 2000, "Bamboo Reports", None, ""]]
    assert column_runs(plan) == [(0, 3), (5, 5)]  # the formula column is not written


def test_skipped_columns_stay_blank_even_when_mapped(data_team):
    plan = plan_columns("centers", ["uuid", "cn_unique_key"], [["CN2", "k"]], [["CN2", "k"]], skip={"cn_unique_key"})
    assert plan.kinds["cn_unique_key"] == "blank"


def test_keys_are_built_like_the_countif_formula(data_team):
    parts = ["account_global_legal_name", "center_name", "center_type", "center_focus", "center_city"]
    headers = ["uuid", "cn_unique_key", *parts]
    old = [["CN2", "old", "3M Co.", "3M India Ltd.", "R&D", "Both", "Pune"]]
    plan = plan_columns("centers", headers, old, old, skip=set(), keys={"cn_unique_key": parts})
    assert plan.kinds["cn_unique_key"] == "key"
    src = [
        ["CN2", "", "3M Co.", "3M India Ltd.", "R&D", "Both", "Pune"],
        ["CN3", "", "3M Co.", "3M India Ltd.", "R&D", "Both", "Pune"],
        ["CN4", "", "3M Co.", "3M India Ltd.", "IT", "Both", "Pune"],
    ]
    rows = build_rows(plan, headers, src)
    assert [r[1] for r in rows] == [
        "3M Co.3M India Ltd.R&DBothPune1",
        "3M Co.3M India Ltd.R&DBothPune2",
        "3M Co.3M India Ltd.ITBothPune1",
    ]
