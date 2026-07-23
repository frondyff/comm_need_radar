"""Build the frontend's stable real-area GeoJSON artifact."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.geospatial.boundaries import (  # noqa: E402
    area_feature_collection,
    build_area_boundaries_from_files,
)


AREA_PATH = PROJECT_ROOT / "data" / "processed" / "area_profile.csv"
BOROUGH_PATH = PROJECT_ROOT / "data" / "raw" / "boundaries" / "montreal_boroughs.geojson"
OUTPUT_PATH = PROJECT_ROOT / "frontend" / "public" / "geo" / "areas.geojson"


def main() -> None:
    boundaries = build_area_boundaries_from_files(AREA_PATH, BOROUGH_PATH)
    collection = area_feature_collection(boundaries)
    payload = json.dumps(collection, ensure_ascii=True, separators=(",", ":")) + "\n"
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(payload, encoding="utf-8")

    raw_size = len(payload.encode("utf-8"))
    gzip_size = len(gzip.compress(payload.encode("utf-8"), mtime=0))
    derived = sum(
        boundary.boundary_type == "centroid_partition_within_official_boundary"
        for boundary in boundaries
    )
    print(f"Wrote {len(boundaries)} area polygons to {OUTPUT_PATH}")
    print(f"  official polygons: {len(boundaries) - derived}")
    print(f"  derived partitions: {derived}")
    print(f"  payload: {raw_size:,} bytes raw; {gzip_size:,} bytes gzip")


if __name__ == "__main__":
    main()
