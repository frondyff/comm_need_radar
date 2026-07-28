"""Build the real processed service table from database_centers.csv.

Writes data/processed/service_table_real.csv following the same shape as the
synthetic data/processed/service_table.csv (docs/reference/data/interfaces.md), but populated
with the real Montreal service points. Named with the `_real` suffix to sit
alongside the synthetic MVP contract file without overwriting it (mirrors
area_vulnerability_index_real.csv).

Usage:
    python scripts/data_pipeline/build_service_table.py
"""
from pathlib import Path
import datetime as dt
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR, PROCESSED_DIR  # noqa: E402

CENTERS_PATH = RAW_DIR / "database_centers.csv"
OUTPUT_PATH = PROCESSED_DIR / "service_table_real.csv"

# Per-category provenance for the source_name / source_url contract fields.
SOURCE_BY_CATEGORY = {
    "Library & Culture": ("Ville de Montreal Open Data", "https://donnees.montreal.ca"),
    "Recreation & Sport": ("Ville de Montreal Open Data", "https://donnees.montreal.ca"),
    "Community & Social Services": ("MSSS / curated / INDex", "see data/raw/source_metadata.csv"),
    "Food Support": ("Moisson Montreal network (curated)", "see data/raw/source_metadata.csv"),
}


def main() -> None:
    centers = pd.read_csv(CENTERS_PATH)
    today = dt.date.today().isoformat()
    src = centers["service_categories"].map(lambda c: SOURCE_BY_CATEGORY.get(c, ("", "")))
    table = pd.DataFrame({
        "service_id": centers["center_id"],
        "service_name": centers["center_name"],
        "service_category": centers["service_categories"],
        "address": centers["address"].fillna(""),
        "latitude": centers["latitude"],
        "longitude": centers["longitude"],
        "phone": "",
        "website": "",
        "language": centers["languages"].fillna(""),
        "source_name": [s[0] for s in src],
        "source_url": [s[1] for s in src],
        "last_checked_date": today,
    })
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(table)} real service rows to {OUTPUT_PATH}")
    print("  categories:", table["service_category"].value_counts().to_dict())


if __name__ == "__main__":
    main()
