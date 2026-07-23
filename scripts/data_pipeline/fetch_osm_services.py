"""Fetch Montreal social-service points from OpenStreetMap (Overpass API).

Pulls community centres, social facilities (shelters, outreach, group homes),
charities, and food banks inside the Montreal administrative area, and writes:

    data/raw/service_sources/osm_social_services.csv

License: OpenStreetMap, ODbL ("(c) OpenStreetMap contributors").

Usage:
    python scripts/data_pipeline/fetch_osm_services.py
"""
from pathlib import Path
import sys

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

OUT = RAW_DIR / "service_sources" / "osm_social_services.csv"
OVERPASS = "https://overpass-api.de/api/interpreter"
QUERY = """
[out:json][timeout:90];
area['name'='Montréal']['boundary'='administrative']->.a;
(
  nwr['amenity'='social_facility'](area.a);
  nwr['amenity'='community_centre'](area.a);
  nwr['amenity'='social_centre'](area.a);
  nwr['amenity'='food_bank'](area.a);
  nwr['social_facility'](area.a);
  nwr['office'='charity'](area.a);
);
out tags center;
"""


def categorize(tags: dict) -> str:
    sf = tags.get("social_facility", "")
    if tags.get("amenity") == "food_bank" or sf == "food_bank":
        return "food_bank"
    return "community_service_211"


def osm_type(tags: dict) -> str:
    return (tags.get("social_facility") or tags.get("amenity") or tags.get("office") or "").strip()


def coords(el: dict):
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    c = el.get("center", {})
    return c.get("lat"), c.get("lon")


def address(tags: dict) -> str:
    num, street = tags.get("addr:housenumber", ""), tags.get("addr:street", "")
    return f"{num} {street}".strip()


def main() -> None:
    r = requests.post(OVERPASS, data={"data": QUERY}, timeout=120,
                      headers={"User-Agent": "CommunityRadar-research/1.0 (McGill BUSA649)"})
    r.raise_for_status()
    rows = []
    for el in r.json().get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        lat, lon = coords(el)
        if not name or lat is None or lon is None:
            continue
        if not (45.3 <= lat <= 45.75 and -74.1 <= lon <= -73.3):
            continue
        rows.append({"name": name, "lat": round(lat, 6), "lon": round(lon, 6),
                     "service_category": categorize(tags), "address": address(tags),
                     "type": osm_type(tags), "source": "openstreetmap"})
    df = pd.DataFrame(rows).drop_duplicates(subset=["name", "lat", "lon"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False, encoding="utf-8")
    print(f"Wrote {len(df)} OSM social-service points to {OUT}")
    print("  categories:", df["service_category"].value_counts().to_dict())


if __name__ == "__main__":
    main()
