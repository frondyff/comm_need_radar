"""Extract STM transit stops from the GTFS feed (optional accessibility layer).

The proposal lists transit as an optional way to move accessibility beyond
straight-line distance toward walking/transit reachability zones. This extracts a
lightweight stop layer from the full GTFS feed for that future work.

Source (under sources dir, default data/raw/_sources/transit/):
    gtfs_stm.zip   (STM General Transit Feed Specification)

Output:
    data/processed/stm_stops.csv   (stop_id, stop_name, stop_lat, stop_lon)

Usage:
    SOURCES_DIR=/path/to/sources python scripts/data_pipeline/build_transit_stops.py
"""
from pathlib import Path
import os
import sys
import zipfile

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR, PROCESSED_DIR  # noqa: E402

SOURCES_DIR = Path(os.environ.get("SOURCES_DIR", RAW_DIR / "_sources"))
GTFS_ZIP = SOURCES_DIR / "transit" / "gtfs_stm.zip"
OUTPUT_PATH = PROCESSED_DIR / "stm_stops.csv"


def main() -> None:
    if not GTFS_ZIP.exists():
        sys.exit(f"Missing source: {GTFS_ZIP} (download the STM GTFS feed there)")
    with zipfile.ZipFile(GTFS_ZIP) as z:
        with z.open("stops.txt") as f:
            stops = pd.read_csv(f)
    keep = [c for c in ["stop_id", "stop_name", "stop_lat", "stop_lon"] if c in stops.columns]
    stops = stops[keep].dropna(subset=["stop_lat", "stop_lon"])
    stops = stops[stops["stop_lat"].between(45.3, 45.75) & stops["stop_lon"].between(-74.1, -73.3)]
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    stops.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(stops)} STM stops to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
