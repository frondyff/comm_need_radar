"""Map each service center to its MVP area_id via a two-step spatial join.

Step 1 — point-in-polygon: assign center lat/lon to a borough using
  data/raw/boundaries/montreal_boroughs.geojson.
Step 2 — nearest centroid: within that borough, assign the center to the
  MVP area whose centroid is closest (handles boroughs that contain more
  than one MVP area, e.g. Villeray-Saint-Michel-Parc-Extension).

Reads:
  data/raw/database_centers.csv          (center_id, center_name, latitude, longitude)
  data/raw/boundaries/montreal_boroughs.geojson
  data/raw/synthetic_area_profiles.csv   (area_id, borough_name, latitude, longitude)

Writes:
  data/processed/center_area_lookup.csv  (center_id, area_id, borough_name, join_method)

If database_centers.csv does not exist, the script exits cleanly with a message
so the rest of the pipeline can still run.
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

from shapely.geometry import Point, shape

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (
    AREA_RAW_PATH,
    CENTER_AREA_LOOKUP_PATH,
    DATABASE_CENTERS_PATH,
)
from comm_need_radar.scoring.metrics import haversine_km

BOUNDARIES_DIR = PROJECT_ROOT / "data" / "raw" / "boundaries"
BOROUGHS_GEOJSON_PATH = BOUNDARIES_DIR / "montreal_boroughs.geojson"

BOROUGH_NAME_MAP = {
    "Villeray-Saint-Michel-Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Côte-des-Neiges-Notre-Dame-de-Grâce": "Cote-des-Neiges-Notre-Dame-de-Grace",
    "Montréal-Nord": "Montreal-Nord",
    "Mercier-Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "Verdun": "Verdun",
    "Ahuntsic-Cartierville": "Ahuntsic-Cartierville",
    "Lachine": "Lachine",
    "Westmount": "Westmount",
    "Le Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Le Sud-Ouest": "Le Sud-Ouest",
    "Rivière-des-Prairies-Pointe-aux-Trembles": "Riviere-des-Prairies-Pointe-aux-Trembles",
}


def load_borough_polygons() -> list[tuple[str, object]]:
    geojson = json.loads(BOROUGHS_GEOJSON_PATH.read_text(encoding="utf-8"))
    result = []
    for feature in geojson["features"]:
        official = feature["properties"]["NOM"]
        project_name = BOROUGH_NAME_MAP.get(official)
        if project_name:
            result.append((project_name, shape(feature["geometry"])))
    return result


def load_areas() -> list[dict[str, str]]:
    with AREA_RAW_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_centers() -> list[dict[str, str]]:
    with DATABASE_CENTERS_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def assign_borough(lat: float, lon: float, polygons: list[tuple[str, object]]) -> str | None:
    point = Point(lon, lat)
    return next((name for name, poly in polygons if poly.contains(point)), None)


def nearest_area_in_borough(lat: float, lon: float, borough_name: str, areas: list[dict[str, str]]) -> str | None:
    candidates = [a for a in areas if a["borough_name"] == borough_name]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda a: haversine_km(lat, lon, float(a["latitude"]), float(a["longitude"])),
    )["area_id"]


def main() -> None:
    if not DATABASE_CENTERS_PATH.exists():
        print(f"database_centers.csv not found at {DATABASE_CENTERS_PATH}. Skipping center-area mapping.")
        print("Deliver data/raw/database_centers.csv (see docs/laura-data-request-real-index.md) and rerun.")
        return

    polygons = load_borough_polygons()
    areas = load_areas()
    centers = load_centers()

    rows: list[dict[str, str]] = []
    unassigned = 0
    for center in centers:
        lat = float(center["latitude"])
        lon = float(center["longitude"])
        borough = assign_borough(lat, lon, polygons)
        if borough is None:
            unassigned += 1
            rows.append({
                "center_id": center["center_id"],
                "area_id": "",
                "borough_name": "",
                "join_method": "unassigned_outside_study_area",
            })
            continue
        area_id = nearest_area_in_borough(lat, lon, borough, areas)
        rows.append({
            "center_id": center["center_id"],
            "area_id": area_id or "",
            "borough_name": borough,
            "join_method": "point_in_polygon_then_nearest_area_centroid",
        })

    CENTER_AREA_LOOKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CENTER_AREA_LOOKUP_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["center_id", "area_id", "borough_name", "join_method"])
        writer.writeheader()
        writer.writerows(rows)

    assigned = len(rows) - unassigned
    print(f"Wrote {len(rows)} center-area rows to {CENTER_AREA_LOOKUP_PATH}")
    print(f"  Assigned: {assigned}  Unassigned (outside study area): {unassigned}")


if __name__ == "__main__":
    main()
