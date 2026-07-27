"""Build the observed-needs index from k-anonymized frontline visitor tags.

Reads:
  data/raw/database_visitor_tags.csv   (k-anonymized aggregate visit records)
  data/processed/center_area_lookup.csv
  data/raw/synthetic_area_profiles.csv  (area_id list and populations)

Writes:
  data/processed/observed_need_index.csv
  data/processed/observed_need_category_summary.csv

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
    OBSERVED_NEED_CATEGORY_SUMMARY_PATH,
    OBSERVED_NEED_INDEX_PATH,
)
from comm_need_radar.scoring.metrics import (
    K_ANON_FLOOR,
    has_sufficient_observed_data,
    v1_demand_score,
    v2_observed_need_score,
)

HIGH_SEVERITY_TAGS = {"Housing & Shelter", "Mental Health", "Health & Wellness", "Legal Aid"}
IMMIGRANT_FOCUS_TAGS = {
    "Settlement Navigation",
    "Language Access",
    "Immigration Legal Need",
    "Newcomer Support",
}
INDIGENOUS_FOCUS_TAGS = {
    "Indigenous Cultural Support",
    "Indigenous-Led Referral",
    "Indigenous-Specific Service Need",
}
SOURCE_METADATA_PATH = PROJECT_ROOT / "data" / "raw" / "source_metadata.csv"


def observed_source_basis() -> str:
    """Return an explicit synthetic/production label from source metadata."""
    if not SOURCE_METADATA_PATH.exists():
        return "unverified_source_fixed_v2_observed_components"
    with SOURCE_METADATA_PATH.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("dataset_name") != "database_visitor_tags.csv":
                continue
            source_text = " ".join(str(value) for value in row.values()).lower()
            if "synthetic" in source_text:
                return "synthetic_demonstration_fixed_v2_observed_components"
            return "approved_production_fixed_v2_observed_components"
    return "unverified_source_fixed_v2_observed_components"


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


def aggregate_area(
    tags: list[dict[str, str]], population: float, today: date
) -> tuple[dict[str, object], list[dict[str, object]]]:
    """Compute all sub-scores for a single area's tags."""
    total_count = sum(int(t["k_anon_count"]) for t in tags)

    visit_volume_per_1000 = round((total_count / max(population, 1)) * 1000, 2)
    visit_volume_score = round(min(100.0, visit_volume_per_1000), 2)

    category_counts: dict[str, int] = {}
    for tag in tags:
        category = tag.get("key_need", "").strip()
        if category:
            category_counts[category] = category_counts.get(category, 0) + int(tag["k_anon_count"])
    ordered_categories = sorted(category_counts.items(), key=lambda item: (-item[1], item[0]))
    top_need_category, top_need_count = ordered_categories[0] if ordered_categories else ("", 0)
    top_need_share_pct = round(top_need_count / total_count * 100, 2)
    top_category_rate_per_1000 = round(top_need_count / max(population, 1) * 1000, 2)
    top_category_pressure_score = round(min(100.0, top_category_rate_per_1000), 2)
    demand_score = v1_demand_score(visit_volume_score, top_category_pressure_score)

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

    focus_count = sum(
        int(t["k_anon_count"])
        for t in tags
        if t.get("key_need") in IMMIGRANT_FOCUS_TAGS | INDIGENOUS_FOCUS_TAGS
        or t.get("language_need_flag", "").lower() in ("1", "true", "yes")
        or t.get("settlement_need_flag", "").lower() in ("1", "true", "yes")
        or t.get("indigenous_specific_need_flag", "").lower() in ("1", "true", "yes")
        or t.get("population_group", "").lower() == "indigenous"
    )
    focus_category_share_score = round(min(100.0, focus_count / max(total_count, 1) * 100), 2)

    # Severity-breadth score: high-severity share + unique category diversity
    high_sev_count = sum(
        int(t["k_anon_count"]) for t in tags if t.get("key_need") in HIGH_SEVERITY_TAGS
    )
    unique_needs = len({t["key_need"] for t in tags if t.get("key_need")})
    severity_breadth_score = round(
        min(100.0, (high_sev_count / max(total_count, 1)) * 70 + min(unique_needs, 10) * 3), 2
    )

    # Recency-weighted score
    weighted_sum = sum(
        int(t["k_anon_count"]) * recency_weight(t["period_end"], today) for t in tags
    )
    recency_score = round(min(100.0, (weighted_sum / max(total_count, 1)) * 100), 2)

    observed_score = v2_observed_need_score(
        visit_volume_score,
        top_category_pressure_score,
        focus_category_share_score,
        severity_breadth_score,
        recency_score,
    )
    category_rows = [
        {
            "key_need": category,
            "encounter_count": count,
            "encounter_share_pct": round(count / total_count * 100, 2),
            "category_rank": rank,
        }
        for rank, (category, count) in enumerate(ordered_categories, start=1)
    ]

    result = {
        "rolling_visit_count": total_count,
        "visit_volume_per_1000": visit_volume_per_1000,
        "observed_visit_volume_score": visit_volume_score,
        "top_need_category": top_need_category,
        "top_need_count": top_need_count,
        "top_need_share_pct": top_need_share_pct,
        "top_category_rate_per_1000": top_category_rate_per_1000,
        "top_category_pressure_score": top_category_pressure_score,
        "v1_demand_score": demand_score,
        "data_through_date": max(t["period_end"] for t in tags),
        "observed_immigrant_need_score": immigrant_need_score,
        "observed_indigenous_need_score": (
            indigenous_need_score if indigenous_need_score is not None else ""
        ),
        "focus_category_share_score": focus_category_share_score,
        "observed_severity_breadth_score": severity_breadth_score,
        "observed_recency_score": recency_score,
        "v2_observed_score": observed_score,
        "observed_focus_need_score": observed_score,
        "observed_data_basis": "unverified_source_fixed_v2_observed_components",
        "insufficient_visit_data": False,
        "top_key_needs": "; ".join(category for category, _ in ordered_categories[:5]),
    }
    return result, category_rows


def stub_row(area_id: str) -> dict[str, object]:
    return {
        "area_id": area_id,
        "rolling_window_days": "",
        "rolling_visit_count": 0,
        "visit_volume_per_1000": "",
        "observed_visit_volume_score": "",
        "top_need_category": "",
        "top_need_count": "",
        "top_need_share_pct": "",
        "top_category_rate_per_1000": "",
        "top_category_pressure_score": "",
        "v1_demand_score": "",
        "data_through_date": "",
        "observed_immigrant_need_score": "",
        "observed_indigenous_need_score": "",
        "focus_category_share_score": "",
        "observed_severity_breadth_score": "",
        "observed_recency_score": "",
        "v2_observed_score": "",
        "observed_focus_need_score": "",
        "observed_data_basis": "no_visit_data",
        "insufficient_visit_data": True,
        "top_key_needs": "",
        "observed_need_rank": "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--window-days", type=int, default=90, help="Rolling window in days (default 90)"
    )
    parser.add_argument(
        "--as-of-date",
        type=date.fromisoformat,
        default=None,
        help="Score recency as of YYYY-MM-DD (default: today)",
    )
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
        print(
            f"Missing: {', '.join(missing)}. Writing stub output with "
            "insufficient_visit_data=True for all areas."
        )
        rows = [stub_row(aid) for aid in all_area_ids]
        _write(rows, [])
        return

    center_lookup = load_center_lookup()
    tags = load_visitor_tags(args.window_days)
    source_basis = observed_source_basis()
    today = args.as_of_date or date.today()

    by_area: dict[str, list[dict[str, str]]] = {aid: [] for aid in all_area_ids}
    for tag in tags:
        area_id = center_lookup.get(tag.get("center_id", ""))
        if area_id and area_id in by_area:
            by_area[area_id].append(tag)

    rows: list[dict[str, object]] = []
    category_rows: list[dict[str, object]] = []
    for area_id in all_area_ids:
        area_tags = by_area[area_id]
        total_count = sum(int(t["k_anon_count"]) for t in area_tags)
        if not has_sufficient_observed_data(total_count):
            rows.append(stub_row(area_id))
        else:
            result, area_category_rows = aggregate_area(area_tags, area_populations[area_id], today)
            result["area_id"] = area_id
            result["rolling_window_days"] = args.window_days
            result["observed_data_basis"] = source_basis
            rows.append(result)
            for category_row in area_category_rows:
                category_row["area_id"] = area_id
                category_rows.append(category_row)

    # Rank areas by observed_focus_need_score descending (nulls last)
    scored = [(i, r) for i, r in enumerate(rows) if r["observed_focus_need_score"] != ""]
    scored.sort(key=lambda x: float(x[1]["observed_focus_need_score"]), reverse=True)
    for rank, (i, _) in enumerate(scored, start=1):
        rows[i]["observed_need_rank"] = rank
    for i, row in enumerate(rows):
        if "observed_need_rank" not in row or row.get("observed_need_rank") == "":
            rows[i]["observed_need_rank"] = ""

    _write(rows, category_rows)
    sufficient = sum(1 for r in rows if not r["insufficient_visit_data"])
    print(f"Wrote {len(rows)} area rows to {OBSERVED_NEED_INDEX_PATH}")
    print(
        f"  Sufficient observed data: {sufficient}  "
        f"Insufficient (fallback): {len(rows) - sufficient}"
    )


def _write(rows: list[dict[str, object]], category_rows: list[dict[str, object]]) -> None:
    OBSERVED_NEED_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "area_id", "rolling_window_days", "rolling_visit_count",
        "visit_volume_per_1000", "observed_visit_volume_score",
        "top_need_category", "top_need_count", "top_need_share_pct",
        "top_category_rate_per_1000", "top_category_pressure_score",
        "v1_demand_score", "data_through_date",
        "observed_immigrant_need_score", "observed_indigenous_need_score",
        "focus_category_share_score",
        "observed_severity_breadth_score", "observed_recency_score",
        "v2_observed_score", "observed_focus_need_score", "observed_data_basis",
        "insufficient_visit_data", "top_key_needs", "observed_need_rank",
    ]
    with OBSERVED_NEED_INDEX_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)

    OBSERVED_NEED_CATEGORY_SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OBSERVED_NEED_CATEGORY_SUMMARY_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "area_id",
                "key_need",
                "encounter_count",
                "encounter_share_pct",
                "category_rank",
            ],
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(category_rows)


if __name__ == "__main__":
    main()
