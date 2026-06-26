"""Build the observed-needs index from k-anonymized frontline visitor tags.

Reads:
  data/raw/database_visitor_tags.csv   (k-anonymized aggregate visit records)
  data/processed/center_area_lookup.csv
  data/raw/synthetic_area_profiles.csv  (area_id list and populations)

Writes:
  data/processed/observed_need_index.csv

Privacy floor: every record must have k_anon_count >= 5. Records below that
threshold must be suppressed or rolled up before this script receives them
(Laura's responsibility). This script enforces the floor defensively by
dropping any row where k_anon_count < 5.

When visitor tags or the center-area lookup are not yet available, the script
writes a stub output for all areas with insufficient_visit_data = True so
build_vulnerability_index_v2.py can still run using structural-only fallback.

Rolling window: configurable via --window-days (default 90).
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (
    AREA_RAW_PATH,
    CENTER_AREA_LOOKUP_PATH,
    DATABASE_VISITOR_TAGS_PATH,
    OBSERVED_NEED_INDEX_PATH,
)
from comm_need_radar.scoring.metrics import (
    K_ANON_FLOOR,
    has_sufficient_observed_data,
    observed_focus_need_score,
)

HIGH_SEVERITY_TAGS = {"Housing & Shelter", "Mental Health", "Health & Wellness", "Legal Aid"}
IMMIGRANT_FOCUS_TAGS = {"Settlement Navigation", "Language Access", "Immigration Legal Need", "Newcomer Support"}
INDIGENOUS_FOCUS_TAGS = {"Indigenous Cultural Support", "Indigenous-Led Referral", "Indigenous-Specific Service Need"}


def load_areas() -> list[dict[str, str]]:
    with AREA_RAW_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_center_lookup() -> dict[str, str]:
    """Returns {center_id: area_id}."""
    if not CENTER_AREA_LOOKUP_PATH.exists():
        return {}
    with CENTER_AREA_LOOKUP_PATH.open(newline="", encoding="utf-8") as f:
        return {row["center_id"]: row["area_id"] for row in csv.DictReader(f) if row["area_id"]}


def load_visitor_tags(window_days: int) -> list[dict[str, str]]:
    """Load tags within the rolling window, applying the k-anonymity floor."""
    cutoff = date.today() - timedelta(days=window_days)
    with DATABASE_VISITOR_TAGS_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    valid = []
    for row in rows:
        if int(row["k_anon_count"]) < K_ANON_FLOOR:
            continue
        try:
            period_end = date.fromisoformat(row["period_end"])
        except (KeyError, ValueError):
            continue
        if period_end >= cutoff:
            valid.append(row)
    return valid


def recency_weight(period_end_str: str, today: date, half_life_days: float = 30.0) -> float:
    """Exponential decay: weight = 0.5^(days_ago / half_life)."""
    days_ago = (today - date.fromisoformat(period_end_str)).days
    return math.exp(-math.log(2) * days_ago / half_life_days)


def aggregate_area(tags: list[dict[str, str]], population: float, today: date) -> dict[str, object]:
    """Compute all sub-scores for a single area's tags."""
    total_count = sum(int(t["k_anon_count"]) for t in tags)

    # Visit volume normalized per 1,000 residents (capped at 100)
    visit_volume_score = round(min(100.0, (total_count / max(population, 1)) * 1000), 2)

    # Immigrant/newcomer focus score
    imm_count = sum(
        int(t["k_anon_count"])
        for t in tags
        if t.get("key_need") in IMMIGRANT_FOCUS_TAGS
        or t.get("language_need_flag", "").lower() in ("1", "true", "yes")
        or t.get("settlement_need_flag", "").lower() in ("1", "true", "yes")
    )
    immigrant_need_score = round(min(100.0, (imm_count / max(total_count, 1)) * 100), 2)

    # Indigenous focus score — only when records are present and pass k floor
    indig_tags = [
        t for t in tags
        if t.get("key_need") in INDIGENOUS_FOCUS_TAGS
        or t.get("indigenous_specific_need_flag", "").lower() in ("1", "true", "yes")
        or t.get("population_group", "").lower() == "indigenous"
    ]
    indig_count = sum(int(t["k_anon_count"]) for t in indig_tags)
    indigenous_need_score: float | None = None
    if has_sufficient_observed_data(indig_count):
        indigenous_need_score = round(min(100.0, (indig_count / max(total_count, 1)) * 100), 2)

    # Severity-breadth score: high-severity share + unique category diversity
    high_sev_count = sum(int(t["k_anon_count"]) for t in tags if t.get("key_need") in HIGH_SEVERITY_TAGS)
    unique_needs = len({t["key_need"] for t in tags if t.get("key_need")})
    severity_breadth_score = round(
        min(100.0, (high_sev_count / max(total_count, 1)) * 70 + min(unique_needs, 10) * 3), 2
    )

    # Recency-weighted score
    weighted_sum = sum(int(t["k_anon_count"]) * recency_weight(t["period_end"], today) for t in tags)
    recency_score = round(min(100.0, (weighted_sum / max(total_count, 1)) * 100), 2)

    score, data_basis = observed_focus_need_score(
        immigrant_need_score, severity_breadth_score, recency_score, indigenous_need_score
    )

    top_needs = sorted(
        {t["key_need"] for t in tags if t.get("key_need")},
        key=lambda n: sum(int(t["k_anon_count"]) for t in tags if t.get("key_need") == n),
        reverse=True,
    )[:5]

    return {
        "rolling_visit_count": total_count,
        "visit_volume_per_1000": visit_volume_score,
        "observed_visit_volume_score": visit_volume_score,
        "observed_immigrant_need_score": immigrant_need_score,
        "observed_indigenous_need_score": indigenous_need_score if indigenous_need_score is not None else "",
        "observed_severity_breadth_score": severity_breadth_score,
        "observed_recency_score": recency_score,
        "observed_focus_need_score": score,
        "observed_data_basis": data_basis,
        "insufficient_visit_data": False,
        "top_key_needs": "; ".join(top_needs),
    }


def stub_row(area_id: str) -> dict[str, object]:
    return {
        "area_id": area_id,
        "rolling_window_days": "",
        "rolling_visit_count": 0,
        "visit_volume_per_1000": "",
        "observed_visit_volume_score": "",
        "observed_immigrant_need_score": "",
        "observed_indigenous_need_score": "",
        "observed_severity_breadth_score": "",
        "observed_recency_score": "",
        "observed_focus_need_score": "",
        "observed_data_basis": "no_visit_data",
        "insufficient_visit_data": True,
        "top_key_needs": "",
        "observed_need_rank": "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-days", type=int, default=90, help="Rolling window in days (default 90)")
    args = parser.parse_args()

    areas = load_areas()
    area_populations = {a["area_id"]: float(a["population"]) for a in areas}
    all_area_ids = [a["area_id"] for a in areas]

    if not DATABASE_VISITOR_TAGS_PATH.exists() or not CENTER_AREA_LOOKUP_PATH.exists():
        missing = []
        if not DATABASE_VISITOR_TAGS_PATH.exists():
            missing.append("database_visitor_tags.csv")
        if not CENTER_AREA_LOOKUP_PATH.exists():
            missing.append("center_area_lookup.csv (run map_centers_to_areas.py first)")
        print(f"Missing: {', '.join(missing)}. Writing stub output with insufficient_visit_data=True for all areas.")
        rows = [stub_row(aid) for aid in all_area_ids]
        _write(rows)
        return

    center_lookup = load_center_lookup()
    tags = load_visitor_tags(args.window_days)
    today = date.today()

    by_area: dict[str, list[dict[str, str]]] = {aid: [] for aid in all_area_ids}
    for tag in tags:
        area_id = center_lookup.get(tag.get("center_id", ""))
        if area_id and area_id in by_area:
            by_area[area_id].append(tag)

    rows: list[dict[str, object]] = []
    for area_id in all_area_ids:
        area_tags = by_area[area_id]
        total_count = sum(int(t["k_anon_count"]) for t in area_tags)
        if not has_sufficient_observed_data(total_count):
            rows.append(stub_row(area_id))
        else:
            result = aggregate_area(area_tags, area_populations[area_id], today)
            result["area_id"] = area_id
            result["rolling_window_days"] = args.window_days
            rows.append(result)

    # Rank areas by observed_focus_need_score descending (nulls last)
    scored = [(i, r) for i, r in enumerate(rows) if r["observed_focus_need_score"] != ""]
    scored.sort(key=lambda x: float(x[1]["observed_focus_need_score"]), reverse=True)
    for rank, (i, _) in enumerate(scored, start=1):
        rows[i]["observed_need_rank"] = rank
    for i, row in enumerate(rows):
        if "observed_need_rank" not in row or row.get("observed_need_rank") == "":
            rows[i]["observed_need_rank"] = ""

    _write(rows)
    sufficient = sum(1 for r in rows if not r["insufficient_visit_data"])
    print(f"Wrote {len(rows)} area rows to {OBSERVED_NEED_INDEX_PATH}")
    print(f"  Sufficient observed data: {sufficient}  Insufficient (fallback): {len(rows) - sufficient}")


def _write(rows: list[dict[str, object]]) -> None:
    OBSERVED_NEED_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "area_id", "rolling_window_days", "rolling_visit_count",
        "visit_volume_per_1000", "observed_visit_volume_score",
        "observed_immigrant_need_score", "observed_indigenous_need_score",
        "observed_severity_breadth_score", "observed_recency_score",
        "observed_focus_need_score", "observed_data_basis",
        "insufficient_visit_data", "top_key_needs", "observed_need_rank",
    ]
    with OBSERVED_NEED_INDEX_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
