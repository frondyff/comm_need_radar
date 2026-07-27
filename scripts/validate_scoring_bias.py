"""Quantify V1/V2 coverage and synthetic-observation bias.

This is a release guard for privacy and output contracts, plus a diagnostic
report for the product decision in issue #9. Bias findings are reported but do
not fail the build; privacy-floor or schema violations do.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
RAW = ROOT / "data" / "raw"


def round_metric(value: float) -> float:
    return round(float(value), 2)


def calculate_metrics() -> dict[str, float | int]:
    observed = pd.read_csv(PROCESSED / "observed_need_index.csv")
    v2 = pd.read_csv(PROCESSED / "vulnerability_index_v2.csv")
    lookup = pd.read_csv(PROCESSED / "center_area_lookup.csv")
    tags = pd.read_csv(RAW / "database_visitor_tags.csv")

    if len(observed) != 12 or len(v2) != 12:
        raise ValueError("Observed and V2 outputs must each contain 12 areas")
    if (tags["k_anon_count"] < 5).any():
        raise ValueError("Visitor-tag input violates the k >= 5 privacy floor")
    if observed["area_id"].duplicated().any() or v2["area_id"].duplicated().any():
        raise ValueError("Observed and V2 area IDs must be unique")

    assigned = lookup["area_id"].notna()
    centers_by_area = lookup.loc[assigned].groupby("area_id").size()
    visits = observed["rolling_visit_count"]
    structural_rank = v2["structural_vulnerability_index"].rank()
    observed_rank = v2["v2_observed_score"].rank()
    v2_structural_rank = v2["structural_vulnerability_index"].rank(
        ascending=False,
        method="min",
    )
    rank_shift = (v2_structural_rank - v2["vulnerability_rank_v2"]).abs()

    return {
        "center_rows": int(len(lookup)),
        "assigned_center_rows": int(assigned.sum()),
        "assigned_center_pct": round_metric(assigned.mean() * 100),
        "min_centers_per_area": int(centers_by_area.min()),
        "max_centers_per_area": int(centers_by_area.max()),
        "center_coverage_ratio_max_to_min": round_metric(
            centers_by_area.max() / centers_by_area.min()
        ),
        "areas_with_sufficient_observed_data": int(
            (~observed["insufficient_visit_data"]).sum()
        ),
        "min_rolling_visits": int(visits.min()),
        "max_rolling_visits": int(visits.max()),
        "visit_volume_ratio_max_to_min": round_metric(visits.max() / visits.min()),
        "visit_volume_coefficient_of_variation": round_metric(
            visits.std(ddof=0) / visits.mean()
        ),
        "structural_observed_spearman": round_metric(
            structural_rank.corr(observed_rank)
        ),
        "mean_absolute_rank_shift": round_metric(rank_shift.mean()),
        "maximum_absolute_rank_shift": int(rank_shift.max()),
        "visitor_tag_rows": int(len(tags)),
        "minimum_k_anon_count": int(tags["k_anon_count"].min()),
        "rows_below_privacy_floor": int((tags["k_anon_count"] < 5).sum()),
    }


def main() -> None:
    metrics = calculate_metrics()
    print(json.dumps(metrics, indent=2, sort_keys=True))
    print(
        "PASS privacy/output contracts; "
        "REVIEW V2 remains experimental because observed inputs are synthetic "
        "and coverage imbalance is material."
    )


if __name__ == "__main__":
    main()
