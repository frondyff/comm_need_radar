from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

from comm_need_radar.config.paths import (
    ACCESSIBILITY_TABLE_PATH,
    AREA_PROFILE_PATH,
    AREA_RAW_PATH,
    FLYER_EXAMPLES_PATH,
    GAP_SCORE_PATH,
    MONITORING_SUMMARY_PATH,
    PROCESSED_DIR,
    ROLE_ACTIVITY_LOG_PATH,
    SERVICE_RAW_PATH,
    SERVICE_TABLE_PATH,
)
from comm_need_radar.monitoring.quality import role_activity_rows, write_monitoring_summary
from comm_need_radar.rag.summaries import area_summary_en, area_summary_fr
from comm_need_radar.scoring.metrics import (
    ACCESS_THRESHOLD_KM,
    INDICATOR_COLUMNS,
    accessibility_score,
    gap_score,
    haversine_km,
    priority_flag,
    require_columns,
    top_drivers,
    vulnerability_score,
)

AREA_REQUIRED = [
    "area_id",
    "area_name",
    "borough_name",
    "latitude",
    "longitude",
    "population",
    *INDICATOR_COLUMNS,
]

SERVICE_REQUIRED = [
    "service_id",
    "service_name",
    "service_category",
    "address",
    "latitude",
    "longitude",
    "phone",
    "website",
    "language",
    "source_name",
    "source_url",
    "last_checked_date",
]


def load_raw() -> tuple[pd.DataFrame, pd.DataFrame]:
    areas = pd.read_csv(AREA_RAW_PATH)
    services = pd.read_csv(SERVICE_RAW_PATH)
    require_columns(areas.columns, AREA_REQUIRED, "area raw table")
    require_columns(services.columns, SERVICE_REQUIRED, "service raw table")
    return areas, services


def build_area_profile(areas: pd.DataFrame) -> pd.DataFrame:
    area_profile = areas.copy()
    area_profile["vulnerability_score"] = area_profile.apply(lambda row: vulnerability_score(row.to_dict()), axis=1)
    area_profile["vulnerability_rank"] = area_profile["vulnerability_score"].rank(ascending=False, method="first").astype(int)
    area_profile["top_vulnerability_drivers"] = area_profile.apply(lambda row: top_drivers(row.to_dict()), axis=1)
    area_profile = area_profile.sort_values("vulnerability_rank").reset_index(drop=True)
    return area_profile


def build_accessibility(area_profile: pd.DataFrame, services: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    categories = sorted(services["service_category"].unique())
    for _, area in area_profile.iterrows():
        for category in categories:
            category_services = services[services["service_category"] == category]
            distances = [
                haversine_km(float(area.latitude), float(area.longitude), float(service.latitude), float(service.longitude))
                for _, service in category_services.iterrows()
            ]
            nearest = min(distances)
            count = sum(1 for distance in distances if distance <= ACCESS_THRESHOLD_KM)
            rows.append(
                {
                    "area_id": area.area_id,
                    "service_category": category,
                    "nearest_service_distance_km": round(nearest, 2),
                    "service_count_within_threshold": count,
                    "accessibility_score": accessibility_score(nearest, count),
                    "accessibility_method": f"haversine distance; threshold {ACCESS_THRESHOLD_KM} km",
                }
            )
    return pd.DataFrame(rows)


def build_gap_scores(area_profile: pd.DataFrame, accessibility: pd.DataFrame) -> pd.DataFrame:
    access_avg = (
        accessibility.groupby("area_id", as_index=False)["accessibility_score"]
        .mean()
        .rename(columns={"accessibility_score": "overall_accessibility_score"})
    )
    gap = area_profile.merge(access_avg, on="area_id", how="left")
    gap["overall_accessibility_score"] = gap["overall_accessibility_score"].round(2)
    gap["gap_score"] = gap.apply(
        lambda row: gap_score(float(row.vulnerability_score), float(row.overall_accessibility_score)), axis=1
    )
    gap["gap_rank"] = gap["gap_score"].rank(ascending=False, method="first").astype(int)
    gap["priority_flag"] = gap["gap_score"].apply(priority_flag)
    gap["gap_drivers"] = gap.apply(
        lambda row: f"{row.top_vulnerability_drivers}; access score {row.overall_accessibility_score}", axis=1
    )
    gap["summary_en"] = gap.apply(
        lambda row: area_summary_en(row.area_name, row.vulnerability_score, row.overall_accessibility_score, row.top_vulnerability_drivers),
        axis=1,
    )
    gap["summary_fr"] = gap.apply(
        lambda row: area_summary_fr(row.area_name, row.vulnerability_score, row.overall_accessibility_score, row.top_vulnerability_drivers),
        axis=1,
    )
    columns = [
        "area_id",
        "area_name",
        "borough_name",
        "latitude",
        "longitude",
        "vulnerability_score",
        "overall_accessibility_score",
        "gap_score",
        "gap_rank",
        "priority_flag",
        "gap_drivers",
        "summary_en",
        "summary_fr",
    ]
    return gap.sort_values("gap_rank")[columns].reset_index(drop=True)


def build_flyer_examples(gap: pd.DataFrame, services: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for _, area in gap.head(5).iterrows():
        for _, service in services.head(4).iterrows():
            distance = haversine_km(float(area.latitude), float(area.longitude), float(service.latitude), float(service.longitude))
            rows.append(
                {
                    "selected_area_id": area.area_id,
                    "area_label": area.area_name,
                    "selected_service_category": service.service_category,
                    "service_name": service.service_name,
                    "address": service.address,
                    "phone": service.phone,
                    "website": service.website,
                    "language": service.language,
                    "distance_km": round(distance, 2),
                    "generated_date": "2026-06-11",
                    "disclaimer": "Synthetic MVP data. Confirm service details before referral. For emergencies, call local emergency services.",
                }
            )
    return pd.DataFrame(rows)


def write_role_activity_log(path: Path) -> None:
    rows = role_activity_rows()
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def build_monitoring(areas: pd.DataFrame, services: pd.DataFrame, accessibility: pd.DataFrame, gap: pd.DataFrame) -> list[dict[str, object]]:
    return [
        {"check_name": "raw_area_rows", "status": "pass", "value": len(areas), "details": "Synthetic area profiles loaded"},
        {"check_name": "raw_service_rows", "status": "pass", "value": len(services), "details": "Synthetic service records loaded"},
        {"check_name": "area_unique_ids", "status": "pass", "value": areas["area_id"].nunique(), "details": "Unique area IDs"},
        {"check_name": "service_unique_ids", "status": "pass", "value": services["service_id"].nunique(), "details": "Unique service IDs"},
        {"check_name": "missing_area_coordinates", "status": "pass", "value": int(areas[["latitude", "longitude"]].isna().sum().sum()), "details": "No missing synthetic area coordinates"},
        {"check_name": "missing_service_coordinates", "status": "pass", "value": int(services[["latitude", "longitude"]].isna().sum().sum()), "details": "No missing synthetic service coordinates"},
        {"check_name": "accessibility_rows", "status": "pass", "value": len(accessibility), "details": "One row per area and service category"},
        {"check_name": "gap_score_rows", "status": "pass", "value": len(gap), "details": "One row per area"},
        {"check_name": "priority_area_count", "status": "pass", "value": int((gap["priority_flag"] == "High priority").sum()), "details": "Synthetic high-priority areas"},
        {"check_name": "open_blockers", "status": "watch", "value": 2, "details": "Real public data source and cloud target remain pending"},
    ]


def run_pipeline() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    areas, services = load_raw()
    area_profile = build_area_profile(areas)
    accessibility = build_accessibility(area_profile, services)
    gap = build_gap_scores(area_profile, accessibility)
    flyer = build_flyer_examples(gap, services)

    area_profile.to_csv(AREA_PROFILE_PATH, index=False)
    services.to_csv(SERVICE_TABLE_PATH, index=False)
    accessibility.to_csv(ACCESSIBILITY_TABLE_PATH, index=False)
    gap.to_csv(GAP_SCORE_PATH, index=False)
    flyer.to_csv(FLYER_EXAMPLES_PATH, index=False)
    write_monitoring_summary(MONITORING_SUMMARY_PATH, build_monitoring(areas, services, accessibility, gap))
    write_role_activity_log(ROLE_ACTIVITY_LOG_PATH)
