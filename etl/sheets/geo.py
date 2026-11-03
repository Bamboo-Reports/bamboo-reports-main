"""
Latitude and longitude for a center, from its city, state and country.

Rules (the main sheet followed them by hand before sync filled lat/lng):
  - city + state + country, when the city is known;
  - state + country, when the city is TBA (or blank);
  - country alone, when the city and the state are both TBA.

Coordinates come from etl/sources/geo.csv, one row per place, matched
ignoring capitals and extra spaces ('india' finds 'India'). A place not in
the file is looked up once on OpenStreetMap (Nominatim, free, no key, one
request a second) and added to the file, so later runs do not ask again.
Correct a wrong coordinate by editing its row in the file.
"""

import csv
import re
import time
from dataclasses import dataclass

import requests

from common.env import ETL_DIR
from common.tui import console

GEO_FILE = ETL_DIR / "sources" / "geo.csv"
FIELDS = ["city", "state", "country", "lat", "lng", "source"]
# Values that mean "not known yet".
PLACEHOLDERS = {"", "tba", "tbd", "na", "n/a", "-"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy asks for a real user agent and at most one
# request a second.
USER_AGENT = "bamboo-reports-etl/1.0 (ops@researchnxt.com)"
LOOKUP_PAUSE = 1.1


def known(value) -> str:
    """The value, tidied, or '' when it is a placeholder such as TBA."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return "" if text.casefold() in PLACEHOLDERS else text


def place(city, state, country) -> tuple[str, str, str]:
    """The place the rules pick: (city, state, country) with the parts not
    used left ''. A TBA city drops to the state, a TBA state too to the
    country. A known city with a TBA state keeps the city."""
    city, state, country = known(city), known(state), known(country)
    if city:
        return city, state, country
    if state:
        return "", state, country
    return "", "", country


def key(city: str, state: str, country: str) -> tuple[str, str, str]:
    return tuple(part.casefold() for part in (city, state, country))


@dataclass
class Coordinates:
    lat: float
    lng: float


class Gazetteer:
    """The places in geo.csv, and lookups for the ones it lacks."""

    def __init__(self, path=GEO_FILE):
        self.path = path
        self.places: dict[tuple[str, str, str], Coordinates] = {}
        self.rows: list[dict] = []
        self.added: list[dict] = []
        self.failed: list[tuple[str, str, str]] = []
        if path.exists():
            with open(path, newline="", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    self.rows.append(row)
                    self.places[key(*place(row["city"], row["state"], row["country"]))] = Coordinates(
                        float(row["lat"]), float(row["lng"])
                    )

    def find(self, city, state, country, lookup: bool = True) -> Coordinates | None:
        """Coordinates for a center's city, state and country, by the rules.
        None when the country is unknown too, or the lookup found nothing."""
        chosen = place(city, state, country)
        if not chosen[2]:
            return None
        k = key(*chosen)
        if k in self.places:
            return self.places[k]
        if not lookup or chosen in self.failed:
            return None
        found = self.lookup(*chosen)
        if found is None:
            self.failed.append(chosen)
            return None
        self.places[k] = found
        city, state, country = chosen
        row = dict(zip(FIELDS, [city or "TBA", state or "TBA", country, found.lat, found.lng, "openstreetmap"]))
        self.rows.append(row)
        self.added.append(row)
        return found

    def lookup(self, city: str, state: str, country: str) -> Coordinates | None:
        query = ", ".join(p for p in (city, state, country) if p)
        console.print(f"  [muted]Looking up {query} on OpenStreetMap ...[/muted]")
        time.sleep(LOOKUP_PAUSE)
        try:
            response = requests.get(
                NOMINATIM,
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": USER_AGENT},
                timeout=30,
            )
            response.raise_for_status()
            results = response.json()
        except (requests.RequestException, ValueError):
            return None
        if not results:
            return None
        return Coordinates(float(results[0]["lat"]), float(results[0]["lon"]))

    def save(self) -> None:
        """Write geo.csv with the places looked up this run added."""
        if not self.added:
            return
        with open(self.path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(self.rows)
