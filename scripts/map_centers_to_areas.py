"""Map each service center to its stable real-boundary area_id.

The shared area-boundary contract uses official administrative polygons and a
documented centroid partition for the two project areas inside Villeray-Saint-
Michel-Parc-Extension. The same geometry is shipped to the frontend.

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
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (
    AREA_RAW_PATH,
    CENTER_AREA_LOOKUP_PATH,
    DATABASE_CENTERS_PATH,
)
from comm_need_radar.geospatial.boundaries import (
    build_area_boundaries_from_files,
    match_point,
)

BOUNDARIES_DIR = PROJECT_ROOT / "data" / "raw" / "boundaries"
BOROUGHS_GEOJSON_PATH = BOUNDARIES_DIR / "montreal_boroughs.geojson"


def load_centers() -> list[dict[str, str]]:
    with DATABASE_CENTERS_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    if not DATABASE_CENTERS_PATH.exists():
        print(f"database_centers.csv not found at {DATABASE_CENTERS_PATH}. Skipping center-area mapping.")
        print("Deliver data/raw/database_centers.csv (see docs/laura-data-request-real-index.md) and rerun.")
        return

    boundaries = build_area_boundaries_from_files(AREA_RAW_PATH, BOROUGHS_GEOJSON_PATH)
    centers = load_centers()

    rows: list[dict[str, str]] = []
    unassigned = 0
    multiply_matched = 0
    for center in centers:
        lat = float(center["latitude"])
        lon = float(center["longitude"])
        matches = match_point(lon, lat, boundaries)
        if len(matches) != 1:
            unassigned += 1
            multiply_matched += len(matches) > 1
            rows.append({
                "center_id": center["center_id"],
                "area_id": "",
                "borough_name": "",
                "join_method": (
                    "unassigned_multiple_area_boundaries"
                    if matches
                    else "unassigned_outside_study_area"
                ),
            })
            continue
        boundary = matches[0]
        rows.append({
            "center_id": center["center_id"],
            "area_id": boundary.area_id,
            "borough_name": boundary.borough_name,
            "join_method": "point_in_real_area_polygon",
        })

    CENTER_AREA_LOOKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CENTER_AREA_LOOKUP_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["center_id", "area_id", "borough_name", "join_method"],
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)

    assigned = len(rows) - unassigned
    print(f"Wrote {len(rows)} center-area rows to {CENTER_AREA_LOOKUP_PATH}")
    print(f"  Assigned: {assigned}  Unassigned (outside study area): {unassigned}")
    print(f"  Multiply matched: {multiply_matched}")


if __name__ == "__main__":
    main()
