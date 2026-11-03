"""Source profiles (etl/sources/*.toml): loading, and their headers mapped to ours."""

import json

import pytest

from common.env import ETL_DIR
from sheets import source
from sheets.rules import ALL_RULES

SCHEMA = json.loads((ETL_DIR / "importer" / "master-schema.json").read_text(encoding="utf-8"))


def schema_columns(table: str) -> set[str]:
    return {c["Column"] for c in SCHEMA[table]["columns"]}


@pytest.fixture
def data_team():
    return source.load("data-team")


def test_main_is_every_sheet_with_our_own_names():
    main = source.load("main")
    assert main.is_main
    assert main.tab("accounts") == "accounts"
    assert main.our_headers("accounts", ["uuid", "whatever"]) == ["uuid", "whatever"]
    assert main.has_column("centers", "lat")


def test_data_team_has_only_the_three_tabs(data_team):
    assert data_team.sheet_names == ["accounts", "centers", "services"]
    assert [data_team.tab(s) for s in data_team.sheet_names] == ["BR", "CM", "SM"]
    assert data_team.tab("prospects") is None
    assert not data_team.in_scope("tech")


def test_every_mapped_column_is_one_of_ours(data_team):
    # A typo on the left of '=' would map a header to a column nothing checks.
    for sheet, mapped in data_team.sheets.items():
        unknown = set(mapped.columns) - schema_columns(sheet)
        assert not unknown, f"{sheet}: not in master-schema.json: {sorted(unknown)}"


def test_every_column_of_ours_is_placed(data_team):
    # Each of our columns is either mapped or written as "" on purpose, so a
    # column added to the schema later shows up here, not as a silent gap.
    path = source.SOURCES_DIR / "data-team.toml"
    import tomllib

    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    for sheet in data_team.sheet_names:
        listed = set(raw[sheet]["columns"])
        assert listed == schema_columns(sheet), f"{sheet}: {sorted(listed ^ schema_columns(sheet))}"


def test_headers_match_ignoring_case_spacing_and_line_breaks(data_team):
    headers = ["BRUID", "Source Link\n(HQ Offering)", "  hq   city ", "Team Member"]
    assert data_team.our_headers("accounts", headers) == [
        "uuid",
        "account_key_offerings_source_link",
        "account_hq_city",
        "team member",  # not mapped: keeps its own name
    ]


def test_columns_the_source_lacks_are_not_checked(data_team):
    assert not data_team.has_column("centers", "lat")
    assert not data_team.has_column("accounts", "account_visibility")
    assert data_team.has_column("centers", "center_focus")
    # Every rule that is checked refers to a mapped column.
    for sheet in data_team.sheet_names:
        checked = [c for c in ALL_RULES[sheet] if data_team.has_column(sheet, c)]
        assert checked


def test_unknown_source_is_a_clear_error():
    with pytest.raises(ValueError, match="No source 'nope'"):
        source.load("nope")


def test_two_columns_mapped_to_one_header_is_an_error(tmp_path, monkeypatch):
    (tmp_path / "dup.toml").write_text(
        'spreadsheet_env = "X"\n[accounts]\ntab = "BR"\n[accounts.columns]\nuuid = "ID"\naccount_about = "id"\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(source, "SOURCES_DIR", tmp_path)
    with pytest.raises(ValueError, match="maps both"):
        source.load("dup")
