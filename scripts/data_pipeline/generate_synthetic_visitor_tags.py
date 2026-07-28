"""Generate SYNTHETIC observed/visitor-need data for the v2 observed-needs index.

The Priority-4 dataset in docs/archive/laura-data-request-real-index.md (k-anonymized
frontline visit aggregates) has NO public source -- it requires a partner
organization. Until a partner provides real data, this generates a synthetic
stand-in that is *grounded in the real service centers* so the observed-needs
index can be built and demonstrated.

IMPORTANT: this data is SYNTHETIC. Every row is model-generated, not observed.
It satisfies the contract's privacy floor (k_anon_count >= 5) and schema, and it
references only real center_ids so the center -> area join works. Replace this
file with a real partner export when available (same schema, same filename).

Output:
    data/raw/database_visitor_tags.csv

Usage:
    python scripts/data_pipeline/generate_synthetic_visitor_tags.py
"""
from pathlib import Path
import random
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

CENTERS_PATH = RAW_DIR / "database_centers.csv"
OUTPUT_PATH = RAW_DIR / "database_visitor_tags.csv"

SEED = 42
PERIOD_START = "2026-04-01"
PERIOD_END = "2026-06-30"   # a single trailing 90-day window

# Recommended key_need vocabulary (docs/archive/laura-data-request-real-index.md).
KEY_NEEDS = [
    "Housing & Shelter", "Mental Health", "Health & Wellness", "Food Support",
    "Employment", "Legal Aid", "Settlement Navigation", "Language Access",
    "Indigenous Cultural Support", "Indigenous-Led Referral", "Family Services",
    "General Support",
]

# Need mix by the kind of center (keys matched against category + type text).
def needs_for(category: str, type_text: str, indigenous: bool) -> list[str]:
    t = (type_text or "").lower()
    if category == "Food Support":
        pool = ["Food Support", "Food Support", "General Support", "Family Services"]
    elif "hospital" in t or "clsc" in t or "psychiatric" in t or "addiction" in t:
        pool = ["Health & Wellness", "Mental Health", "General Support", "Family Services"]
    elif "youth" in t:
        pool = ["Family Services", "Mental Health", "General Support", "Employment"]
    else:  # generic community / social service
        pool = ["Housing & Shelter", "Mental Health", "Food Support", "Employment",
                "Legal Aid", "Settlement Navigation", "Language Access",
                "Family Services", "General Support"]
    if indigenous:
        pool = pool + ["Indigenous Cultural Support", "Indigenous-Led Referral"]
    return pool


def main() -> None:
    random.seed(SEED)
    centers = pd.read_csv(CENTERS_PATH)
    # Observed needs only make sense for social-service centers, not parks/venues.
    social = centers[centers["service_categories"].isin(
        ["Community & Social Services", "Food Support"])].copy()

    rows = []
    gid = 1
    for _, c in social.iterrows():
        indigenous = bool(c["indigenous_led_or_specific"])
        pool = needs_for(c["service_categories"], str(c.get("hours", "")) or str(c.get("center_name", "")),
                         indigenous)
        # 1-3 distinct need groups per center
        chosen = random.sample(list(dict.fromkeys(pool)), k=min(len(set(pool)), random.randint(1, 3)))
        for need in chosen:
            # population group weighted by center flavour
            if indigenous and need.startswith("Indigenous"):
                pop = "indigenous"
            elif need in ("Settlement Navigation", "Language Access"):
                pop = random.choice(["immigrant_newcomer", "immigrant_newcomer", "general"])
            elif indigenous:
                pop = random.choice(["indigenous", "general"])
            else:
                pop = random.choice(["general", "general", "immigrant_newcomer", ""])
            rows.append({
                "visit_group_id": f"VG_{gid:06d}",
                "center_id": c["center_id"],
                "period_start": PERIOD_START,
                "period_end": PERIOD_END,
                "key_need": need,
                # privacy floor: never below 5
                "k_anon_count": int(round(5 + random.lognormvariate(2.6, 0.8))),
                "severity": random.choices(["low", "medium", "high"], weights=[3, 4, 2])[0],
                "population_group": pop,
                "language_need_flag": pop == "immigrant_newcomer" or need == "Language Access",
                "settlement_need_flag": need == "Settlement Navigation" or pop == "immigrant_newcomer",
                "indigenous_specific_need_flag": pop == "indigenous" or need.startswith("Indigenous"),
            })
            gid += 1

    df = pd.DataFrame(rows)
    assert (df["k_anon_count"] >= 5).all(), "k-anonymity floor violated"
    assert df["center_id"].isin(set(centers["center_id"])).all(), "center_id must reference real centers"
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(df)} SYNTHETIC visit-group rows to {OUTPUT_PATH}")
    print(f"  across {df['center_id'].nunique()} real social-service centers")
    print(f"  key_need mix: {df['key_need'].value_counts().head(6).to_dict()}")
    print(f"  population_group: {df['population_group'].value_counts().to_dict()}")
    print("  NOTE: synthetic — replace with a real k-anonymized partner export when available.")


if __name__ == "__main__":
    main()
