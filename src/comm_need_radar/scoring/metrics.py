from __future__ import annotations

import math
from typing import Iterable

K_ANON_FLOOR = 5
STRUCTURAL_WEIGHT = 0.6
OBSERVED_WEIGHT = 0.4
V1_VOLUME_WEIGHT = 0.7
V1_TOP_CATEGORY_WEIGHT = 0.3
V2_OBSERVED_WEIGHTS = {
    "visit_volume": 0.3,
    "top_category_pressure": 0.2,
    "focus_category_share": 0.2,
    "severity_breadth": 0.2,
    "recency": 0.1,
}

INDICATOR_COLUMNS = [
    "income_indicator",
    "age_indicator",
    "language_indicator",
    "immigration_indicator",
    "housing_indicator",
]

DRIVER_LABELS = {
    "income_indicator": "income pressure",
    "age_indicator": "age-related support need",
    "language_indicator": "language access need",
    "immigration_indicator": "newcomer support need",
    "housing_indicator": "housing pressure",
}

ACCESS_THRESHOLD_KM = 2.5


def min_max_scale(value: float, min_value: float, max_value: float) -> float:
    if max_value == min_value:
        return 0.0
    return (value - min_value) / (max_value - min_value) * 100.0


def vulnerability_score(row: dict[str, float]) -> float:
    values = [float(row[col]) for col in INDICATOR_COLUMNS]
    return round(sum(values) / len(values), 2)


def top_drivers(row: dict[str, float], limit: int = 3) -> str:
    ordered = sorted(INDICATOR_COLUMNS, key=lambda col: float(row[col]), reverse=True)
    return "; ".join(DRIVER_LABELS[col] for col in ordered[:limit])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * radius_km * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def accessibility_score(nearest_distance_km: float, service_count: int) -> float:
    """Return the ACCESS-LEGACY-01 synthetic-data accessibility score."""
    distance_component = max(0.0, 100.0 - (nearest_distance_km / ACCESS_THRESHOLD_KM * 70.0))
    count_component = min(service_count, 5) * 6.0
    return round(min(100.0, distance_component + count_component), 2)


def relative_accessibility_score(
    nearest_distance_km: float,
    service_count: int,
    max_category_count: int,
    *,
    threshold_km: float = ACCESS_THRESHOLD_KM,
    distance_weight: float = 0.5,
    availability_weight: float = 0.5,
) -> tuple[float, float, float]:
    """Return ACCESS-REAL-02 and its auditable distance/count components."""
    if threshold_km <= 0:
        raise ValueError("threshold_km must be positive")
    if service_count < 0 or max_category_count < 0:
        raise ValueError("service counts cannot be negative")
    if service_count > max_category_count:
        raise ValueError("service_count cannot exceed max_category_count")
    if not math.isclose(distance_weight + availability_weight, 1.0):
        raise ValueError("accessibility weights must sum to 1")

    capped_distance = min(max(float(nearest_distance_km), 0.0), threshold_km)
    distance_component = 100.0 * max(0.0, 1.0 - capped_distance / threshold_km)
    availability_component = (
        0.0
        if max_category_count == 0
        else 100.0
        * math.log1p(service_count)
        / math.log1p(max_category_count)
    )
    # Round the stored components first so a reviewer can reconcile the stored
    # score from the exposed values within the documented 0.01 tolerance.
    distance_component = round(distance_component, 2)
    availability_component = round(availability_component, 2)
    score = (
        distance_weight * distance_component
        + availability_weight * availability_component
    )
    return (
        round(min(100.0, max(0.0, score)), 2),
        distance_component,
        availability_component,
    )


def gap_score(vulnerability: float, accessibility: float) -> float:
    access_deficit = 100.0 - accessibility
    return round(vulnerability * access_deficit / 100.0, 2)


def priority_flag(score: float) -> str:
    """Return the historical CLASS-LEGACY-01 threshold label."""
    if score >= 45:
        return "High priority"
    if score >= 28:
        return "Watch"
    return "Lower priority"


TOP_PRIORITY_CUTOFF_RANK = 5
TOP_PRIORITY_COMPARISON_SET_SIZE = 12
TOP_PRIORITY_BAND = "high_candidate"
TOP_PRIORITY_LABEL = "High-priority candidate (POC)"
TOP_PRIORITY_CLASSIFICATION_STATUS = "poc_relative_candidate"


def top_priority_candidate(
    rank: int,
    *,
    cutoff_rank: int = TOP_PRIORITY_CUTOFF_RANK,
    comparison_set_size: int = TOP_PRIORITY_COMPARISON_SET_SIZE,
) -> tuple[str, str]:
    """Classify only the relative top ranks in the fixed POC comparison set.

    This is CLASS-TOP5-02, not the retired absolute High/Watch/Lower
    classification. Rows outside the cutoff deliberately receive no band or
    public priority label.
    """
    if not 1 <= rank <= comparison_set_size:
        raise ValueError("rank must be within the comparison set")
    if not 1 <= cutoff_rank <= comparison_set_size:
        raise ValueError("cutoff_rank must be within the comparison set")
    if rank <= cutoff_rank:
        return TOP_PRIORITY_BAND, TOP_PRIORITY_LABEL
    return "", ""


def require_columns(columns: Iterable[str], required: Iterable[str], table_name: str) -> None:
    missing = sorted(set(required) - set(columns))
    if missing:
        raise ValueError(f"{table_name} is missing required columns: {', '.join(missing)}")


def has_sufficient_observed_data(area_visit_count: int) -> bool:
    """Return True when the area's aggregated visit count meets the k-anonymity floor."""
    return area_visit_count >= K_ANON_FLOOR


def v1_demand_score(visit_volume_score: float, top_category_pressure_score: float) -> float:
    """Summarize current frontline service demand on a 0-100 scale."""
    score = (
        V1_VOLUME_WEIGHT * visit_volume_score
        + V1_TOP_CATEGORY_WEIGHT * top_category_pressure_score
    )
    return round(min(100.0, max(0.0, score)), 2)


def v2_observed_need_score(
    visit_volume_score: float,
    top_category_pressure_score: float,
    focus_category_share_score: float,
    severity_breadth_score: float,
    recency_score: float,
) -> float:
    """Combine fixed observed-demand components for the V2 planning score."""
    components = {
        "visit_volume": visit_volume_score,
        "top_category_pressure": top_category_pressure_score,
        "focus_category_share": focus_category_share_score,
        "severity_breadth": severity_breadth_score,
        "recency": recency_score,
    }
    score = sum(V2_OBSERVED_WEIGHTS[name] * value for name, value in components.items())
    return round(min(100.0, max(0.0, score)), 2)


def observed_focus_need_score(
    immigrant_need_score: float,
    severity_breadth_score: float,
    recency_score: float,
    indigenous_need_score: float | None = None,
) -> tuple[float, str]:
    """Compute the legacy variable-component observed score.

    Retained for compatibility. New V2 outputs use v2_observed_need_score().
    indigenous_need_score is included only when the caller confirms it is not
    suppressed (k-anonymized count >= K_ANON_FLOOR for that group).
    """
    components: list[float] = [immigrant_need_score, severity_breadth_score, recency_score]
    basis_parts: list[str] = ["immigrant_need", "severity_breadth", "recency"]
    if indigenous_need_score is not None:
        components.append(indigenous_need_score)
        basis_parts.append("indigenous_need")
    score = round(sum(components) / len(components), 2)
    return score, "_".join(basis_parts)


def composite_vulnerability_index(
    structural_score: float,
    observed_score: float | None,
    structural_weight: float = STRUCTURAL_WEIGHT,
    observed_weight: float = OBSERVED_WEIGHT,
) -> tuple[float, str]:
    """Combine structural census score and observed needs score into v2.

    Returns (v2_score 0-100, data_basis string).
    Falls back to structural only when observed data is insufficient.
    """
    if observed_score is None:
        return round(structural_score, 2), "structural_focus_only_observed_insufficient"
    v2 = round(structural_weight * structural_score + observed_weight * observed_score, 2)
    return v2, "structural_and_observed_focus"
