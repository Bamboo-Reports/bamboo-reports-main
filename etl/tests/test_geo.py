"""lat and lng from city, state and country (sheets/geo.py)."""

import csv

import pytest

from sheets import geo


@pytest.fixture
def gazetteer(tmp_path, monkeypatch):
    path = tmp_path / "geo.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=geo.FIELDS)
        writer.writeheader()
        writer.writerows(
            [
                {"city": "Bengaluru", "state": "Karnataka", "country": "India", "lat": "12.9628957", "lng": "77.57754", "source": "main sheet"},
                {"city": "TBA", "state": "Haryana", "country": "India", "lat": "29.0587757", "lng": "76.085601", "source": "main sheet"},
                {"city": "TBA", "state": "TBA", "country": "India", "lat": "20.593684", "lng": "78.96288", "source": "main sheet"},
            ]
        )
    monkeypatch.setattr(geo, "LOOKUP_PAUSE", 0)
    return geo.Gazetteer(path)


def test_city_state_country(gazetteer):
    assert gazetteer.find("Bengaluru", "Karnataka", "India") == geo.Coordinates(12.9628957, 77.57754)


def test_matching_ignores_capitals_and_spaces(gazetteer):
    # The data team wrote 'india' on a few rows.
    assert gazetteer.find(" bengaluru ", "KARNATAKA", "india") == geo.Coordinates(12.9628957, 77.57754)


def test_tba_city_takes_the_state(gazetteer):
    assert gazetteer.find("TBA", "Haryana", "India") == geo.Coordinates(29.0587757, 76.085601)
    assert gazetteer.find("", "Haryana", "India") == geo.Coordinates(29.0587757, 76.085601)


def test_tba_city_and_state_take_the_country(gazetteer):
    assert gazetteer.find("TBA", "TBA", "India") == geo.Coordinates(20.593684, 78.96288)
    assert gazetteer.find("tba", "", "India") == geo.Coordinates(20.593684, 78.96288)


def test_no_country_means_no_coordinates(gazetteer):
    assert gazetteer.find("TBA", "TBA", "TBA") is None


def test_a_new_city_is_looked_up_once_and_saved(gazetteer, monkeypatch):
    asked = []

    def lookup(city, state, country):
        asked.append((city, state, country))
        return geo.Coordinates(28.19, 76.62)

    monkeypatch.setattr(gazetteer, "lookup", lookup)
    assert gazetteer.find("Rewari", "Haryana", "India") == geo.Coordinates(28.19, 76.62)
    assert gazetteer.find("Rewari", "Haryana", "India") == geo.Coordinates(28.19, 76.62)
    assert asked == [("Rewari", "Haryana", "India")]
    gazetteer.save()
    again = geo.Gazetteer(gazetteer.path)
    assert again.find("rewari", "haryana", "india", lookup=False) == geo.Coordinates(28.19, 76.62)
    assert again.rows[-1]["source"] == "openstreetmap"


def test_a_city_not_found_stays_blank_and_is_not_asked_again(gazetteer, monkeypatch):
    asked = []
    monkeypatch.setattr(gazetteer, "lookup", lambda *place: asked.append(place))
    assert gazetteer.find("Nowhere", "Haryana", "India") is None
    assert gazetteer.find("Nowhere", "Haryana", "India") is None
    assert asked == [("Nowhere", "Haryana", "India")]
    assert gazetteer.failed == [("Nowhere", "Haryana", "India")]
    # A known city that is not found never falls back to the state.
    assert gazetteer.find("Nowhere", "Haryana", "India") != geo.Coordinates(29.0587757, 76.085601)


def test_the_real_file_covers_its_own_rules():
    real = geo.Gazetteer()
    assert len(real.places) >= 283
    assert real.find("TBA", "TBA", "India", lookup=False) == geo.Coordinates(20.593684, 78.96288)
