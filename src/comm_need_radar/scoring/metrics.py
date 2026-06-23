from __future__ import annotations

import math
from typing import Iterable

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
    distance_component = max(0.0, 100.0 - (nearest_distance_km / ACCESS_THRESHOLD_KM * 70.0))
    count_component = min(service_count, 5) * 6.0
    return round(min(100.0, distance_component + count_component), 2)


def gap_score(vulnerability: float, accessibility: float) -> float:
    access_deficit = 100.0 - accessibility
    return round(vulnerability * access_deficit / 100.0, 2)


def priority_flag(score: float) -> str:
    if score >= 45:
        return "High priority"
    if score >= 28:
        return "Watch"
    return "Lower priority"


def require_columns(columns: Iterable[str], required: Iterable[str], table_name: str) -> None:
    missing = sorted(set(required) - set(columns))
    if missing:
        raise ValueError(f"{table_name} is missing required columns: {', '.join(missing)}")
